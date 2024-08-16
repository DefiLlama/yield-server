const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee');
const { getCakeAprs, CAKE, chainIds } = require('./cakeReward');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'CJYGNhb7RvnhfBDjqpRnD3oxgyhibzc7fkAMa38YV3oS'
  ),
  // temp disable bsc
  // bsc: sdk.graph.modifyEndpoint('Hv1GncLY5docZoGtXjo4kwbTvxm3MAhVZqBZE4sUT9eZ'),
  polygon_zkevm:
    'https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest',
  era: 'https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest',
  arbitrum: sdk.graph.modifyEndpoint(
    '251MHFNN1rwjErXD2efWMpNS73SANZN8Ua192zw6iXve'
  ),
  op_bnb: 'https://proxy-worker-dev.pancake-swap.workers.dev/opbnb-exchange-v3',
  linea:
    'https://graph-query.linea.build/subgraphs/name/pancakeswap/exchange-v3-linea',
};

const cakeByFormatChain = Object.keys(chains).reduce((acc, chain) => {
  acc[utils.formatChain(chain)] = CAKE[chain];
  return acc;
}, {});

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
      feeProtocol
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp,
  stablecoins
) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
      chainString,
      timestamp,
      [url],
      604800
    );

    // pull data
    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pools;

    dataNow = dataNow.map((p) => {
      return {
        ...p,
        reserve0: p.totalValueLockedToken0,
        reserve1: p.totalValueLockedToken1,
      };
    });

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    let dataPrior = await request(
      url,
      queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= boundaries.tvlUsdDB.lb
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = utils.formatSymbol(
        `${p.token0.symbol}-${p.token1.symbol}`
      );
      const stablecoin = checkStablecoin({ ...p, symbol }, stablecoins);
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

    // for new v3 apy calc
    const dataPrior7d = (
      await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    ).pools;

    // calc apy (note: old way of using 24h fees * 365 / tvl. keeping this for now) and will store the
    // new apy calc as a separate field
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    const enableV3Apy = true;
    if (enableV3Apy) {
      dataNow = dataNow.map((p) => ({
        ...p,
        token1_in_token0: p.price1 / p.price0,
      }));

      // batching the tick query into 3 chunks to prevent it from breaking
      const nbBatches = 3;
      const chunkSize = Math.ceil(dataNow.length / nbBatches);
      const chunks = [
        dataNow.slice(0, chunkSize).map((i) => i.id),
        dataNow.slice(chunkSize, chunkSize * 2).map((i) => i.id),
        dataNow.slice(chunkSize * 2, dataNow.length).map((i) => i.id),
      ];

      const tickData = {};
      // we fetch 3 pages for each pool
      for (const page of [0, 1, 2]) {
        console.log(`page nb: ${page}`);
        let pageResults = {};
        for (const chunk of chunks) {
          console.log(chunk.length);
          const tickQuery = `
          query {
            ${chunk
              .map(
                (poolAddress, index) => `
              pool_${poolAddress}: ticks(
                first: 1000,
                skip: ${page * 1000},
                where: { poolAddress: "${poolAddress}" },
                orderBy: tickIdx
              ) {
                tickIdx
                liquidityNet
                price0
                price1
              }
            `
              )
              .join('\n')}
          }
        `;

          try {
            const response = await request(url, tickQuery);
            pageResults = { ...pageResults, ...response };
          } catch (err) {
            console.log(err);
          }
        }
        tickData[`page_${page}`] = pageResults;
      }

      // reformat tickData
      const ticks = {};
      Object.values(tickData).forEach((page) => {
        Object.entries(page).forEach(([pool, values]) => {
          if (!ticks[pool]) {
            ticks[pool] = [];
          }
          ticks[pool] = ticks[pool].concat(values);
        });
      });

      // assume an investment of 1e5 USD
      const investmentAmount = 1e5;

      // tick range
      const pct = 0.3;
      const pctStablePool = 0.001;

      dataNow = dataNow.map((p) => {
        const poolTicks = ticks[`pool_${p.id}`] ?? [];

        if (!poolTicks.length) {
          console.log(`No pool ticks found for ${p.id}`);
          return { ...p, estimatedFee: null, apy7d: null };
        }

        const delta = p.stablecoin ? pctStablePool : pct;

        const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

        const estimatedFee = EstimatedFees(
          priceAssumption,
          [p.token1_in_token0 * (1 - delta), p.token1_in_token0 * (1 + delta)],
          p.price1,
          p.price0,
          investmentAmount,
          p.token0.decimals,
          p.token1.decimals,
          p.feeTier,
          p.volumeUSD7d,
          p.feeProtocol,
          poolTicks
        );

        const apy7d = ((estimatedFee * 52) / investmentAmount) * 100;

        return { ...p, estimatedFee, apy7d };
      });
    }

    return dataNow.map((p) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];

      const chainId = chainIds[chainString].id;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://pancakeswap.finance/add/${token0}/${token1}/${feeTier}?chainId=${chainId}`;

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'pancakeswap-amm-v3',
        poolMeta: poolMeta,
        symbol: p.symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d,
        apyBase7d: p.apy7d,
        underlyingTokens,
        url,
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
      };
    });
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async (timestamp = null) => {
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  const data = [];
  let cakeAPRsByChain = {};
  for (const [chain, url] of Object.entries(chains)) {
    console.log(chain);
    try {
      cakeAPRsByChain[utils.formatChain(chain)] = await getCakeAprs(chain);

      data.push(
        await topLvl(
          chain,
          url,
          query,
          queryPrior,
          'v3',
          timestamp,
          stablecoins
        )
      );
    } catch (err) {
      console.log(err);
    }
  }

  return data
    .flat()
    .filter((p) => utils.keepFinite(p))
    .map((p) => {
      if (
        cakeAPRsByChain[p.chain] &&
        cakeAPRsByChain[p.chain] &&
        cakeAPRsByChain[p.chain][p.pool]
      ) {
        return {
          ...p,
          apyReward: cakeAPRsByChain[p.chain][p.pool],
          rewardTokens: [
            cakeByFormatChain[p.chain] ??
              '0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898',
          ],
        };
      }
      return p;
    });
};

module.exports = {
  timetravel: false,
  apy: main,
};
