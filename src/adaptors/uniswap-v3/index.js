const sdk = require('@defillama/sdk5');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee.ts');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const chains = {
  ethereum: `${baseUrl}/uniswap/uniswap-v3`,
  polygon: `https://gateway-arbitrum.network.thegraph.com/api/a265c39f5a123ab2d40b25dc352adc22/subgraphs/id/3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm`,
  arbitrum: `https://api.thegraph.com/subgraphs/id/QmZ5uwhnwsJXAQGYEF8qKPQ85iVhYAcVZcZAPfrF7ZNb9z`,
  optimism: `${baseUrl}/ianlapham/optimism-post-regenesis`,
  celo: `${baseUrl}/jesse-sawa/uniswap-celo`,
  avax: `${baseUrl}/lynnshaoyu/uniswap-v3-avax`,
  bsc: `${baseUrl}/ianlapham/uniswap-v3-bsc`,
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

    if (chainString !== 'arbitrum') {
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
            [
              p.token1_in_token0 * (1 - delta),
              p.token1_in_token0 * (1 + delta),
            ],
            p.price1,
            p.price0,
            investmentAmount,
            p.token0.decimals,
            p.token1.decimals,
            p.feeTier,
            url,
            p.volumeUSD7d
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
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
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
        p.pool !== '0x0c6d9d0f82ed2e0b86c4d3e9a9febf95415d1b76'
    );
};

module.exports = {
  timetravel: false,
  apy: main,
};
