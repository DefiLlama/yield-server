const sdk = require('@defillama/sdk4');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee');
const { getCakeAprs, CAKE, chainIds } = require('./cakeReward');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const chains = {
  ethereum: `${baseUrl}/pancakeswap/exchange-v3-eth`,
  // temp disable bsc
  // bsc: `${baseUrl}/pancakeswap/exchange-v3-bsc`,
  polygon_zkevm:
    'https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest',
  era: 'https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest',
  arbitrum: `${baseUrl}/pancakeswap/exchange-v3-arb`,
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

    dataNow = dataNow.map((p) => ({
      ...p,
      token1_in_token0: p.price1 / p.price0,
    }));

    // split up subgraph tick calls into n-batches
    // (tick response can be in the thousands per pool)
    const skip = 20;
    let start = 0;
    let stop = skip;
    const pages = Math.floor(dataNow.length / skip);

    // tick range
    const pct = 0.3;
    const pctStablePool = 0.001;

    // assume an investment of 1e5 USD
    const investmentAmount = 1e5;
    let X = [];
    for (let i = 0; i <= pages; i++) {
      console.log(i);
      let promises = dataNow.slice(start, stop).map((p) => {
        const delta = p.stablecoin ? pctStablePool : pct;

        const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

        return EstimatedFees(
          p.id,
          priceAssumption,
          [p.token1_in_token0 * (1 - delta), p.token1_in_token0 * (1 + delta)],
          p.price1,
          p.price0,
          investmentAmount,
          p.token0.decimals,
          p.token1.decimals,
          p.feeTier,
          url,
          p.volumeUSD7d,
          p.feeProtocol
        );
      });
      X.push(await Promise.all(promises));
      start += skip;
      stop += skip;
    }
    const d = {};
    X.flat().forEach((p) => {
      d[p.poolAddress] = p.estimatedFee;
    });

    dataNow = dataNow.map((p) => ({
      ...p,
      apy7d: ((d[p.id] * 52) / investmentAmount) * 100,
    }));

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
    cakeAPRsByChain[utils.formatChain(chain)] = await getCakeAprs(chain);
    console.log(chain);
    data.push(
      await topLvl(chain, url, query, queryPrior, 'v3', timestamp, stablecoins)
    );
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
