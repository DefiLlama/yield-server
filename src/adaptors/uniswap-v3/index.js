const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee.ts');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM'
  ),
  optimism: sdk.graph.modifyEndpoint(
    '7SVwgBfXoWmiK6x1NF1VEo1szkeWLniqWN1oYsX3UMb5'
  ),
  celo: sdk.graph.modifyEndpoint(
    '5GMxLtvwbfKxyCpSgHvS8FbeofS2ry9K76NL9RCzPNm2'
  ),
  avax: sdk.graph.modifyEndpoint(
    'GVH9h9KZ9CqheUEL93qMbq7QwgoBu32QXQDPR6bev4Eo'
  ),
  bsc: sdk.graph.modifyEndpoint('GcKPSgHoY42xNYVAkSPDhXSzi6aJDRQSKqBSXezL47gV'),
  base: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
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

    // uni v3 subgraph reserves values are wrong!
    // instead of relying on subgraph values, gonna pull reserve data from contracts
    // new tvl calc
    // let
    if (chainString === 'base') {
      const excludeTokens = [
        '0xb50721bcf8d664c30412cfbc6cf7a15145234ad1',
        '0x4d224452801aced8b2f0aebe155379bb5d594381',
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        '0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7',
        '0x4701f80124f5ebf6846a43929b22a917bc30b2ca',
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ];
      dataNow = dataNow.filter(
        (p) =>
          !excludeTokens.some((i) => i === p.token0.id || i === p.token1.id)
      );
    }

    const balanceCalls = [];
    for (const pool of dataNow) {
      balanceCalls.push({
        target: pool.token0.id,
        params: pool.id,
      });
      balanceCalls.push({
        target: pool.token1.id,
        params: pool.id,
      });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
      permitFailure: true,
    });

    dataNow = dataNow.map((p) => {
      const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
      return {
        ...p,
        reserve0:
          x.find((i) => i.input.target === p.token0.id).output /
          `1e${p.token0.decimals}`,
        reserve1:
          x.find((i) => i.input.target === p.token1.id).output /
          `1e${p.token1.decimals}`,
      };
    });

    // balance calls not working on the uni v3 avax contracts
    if (chainString === 'avax') {
      dataNow = dataNow.map((p) => ({
        ...p,
        reserve0: Number(p.totalValueLockedToken0),
        reserve1: Number(p.totalValueLockedToken1),
      }));
    }

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
    // note re arbitrum: their subgraph is outdated (no tick data -> no uni v3 style apy calc)
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    const enableV3Apy = true;
    if (enableV3Apy && chainString !== 'arbitrum') {
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
      const chain = chainString === 'ethereum' ? 'mainnet' : chainString;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://app.uniswap.org/#/add/${token0}/${token1}/${feeTier}?chain=${chain}`;

      let symbol = p.symbol;
      if (
        chainString === 'arbitrum' &&
        underlyingTokens
          .map((t) => t.toLowerCase())
          .includes('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8')
      ) {
        symbol = p.symbol.replace('USDC', 'USDC.e');
      }
      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'uniswap-v3',
        poolMeta: `${poolMeta}, stablePool=${p.stablecoin}`,
        symbol,
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
    console.log(chainString, e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const stablecoins = (
    await axios.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).data.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    console.log(chain);
    data.push(
      await topLvl(chain, url, query, queryPrior, 'v3', timestamp, stablecoins)
    );
  }
  return data
    .flat()
    .filter(
      (p) =>
        utils.keepFinite(p) &&
        ![
          '0x0c6d9d0f82ed2e0b86c4d3e9a9febf95415d1b76',
          '0xc809d13e9ea08f296d3b32d4c69d46ff90f73fd8',
        ].includes(p.pool)
    );
};

module.exports = {
  timetravel: false,
  apy: main,
};
