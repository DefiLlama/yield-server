const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee.ts');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');

const baseUrl = 'https://api.thegraph.com/subgraphs/name';
const chains = {
  ethereum: `${baseUrl}/uniswap/uniswap-v3`,
  polygon: `${baseUrl}/ianlapham/uniswap-v3-polygon`,
  arbitrum: `${baseUrl}/ianlapham/arbitrum-dev`,
  optimism: `${baseUrl}/ianlapham/optimism-post-regenesis`,
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
  timestamp
) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pools;

  // uni v3 subgraph reserves values are wrong!
  // instead of relying on subgraph values, gonna pull reserve data from contracts
  // new tvl calc
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

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pools;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);

  dataNow = dataNow.map((p) => ({
    ...p,
    symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
  }));
  dataNow = dataNow.filter((p) => p.totalValueLockedUSD >= 1000);

  // arbitrums subgraph is missing data (such as ticks), defaulting to full range
  if (chainString === 'arbitrum') {
    // calculate apy
    dataNow = dataNow.map((el) => utils.apy(el, dataPrior, version));
  } else {
    const stablecoins = (
      await superagent.get(
        'https://stablecoins.llama.fi/stablecoins?includePrices=true'
      )
    ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
    if (!stablecoins.includes('eur')) stablecoins.push('eur');
    if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

    dataNow = dataNow.map((p) => ({
      ...p,
      stablecoin: checkStablecoin(p, stablecoins),
      token1_in_token0: p.price1 / p.price0,
    }));

    // split up calls into n-batches of size skip (tick response can be in the thousands per pool)
    const skip = 50;
    let start = 0;
    let stop = skip;
    const pages = Math.floor(dataNow.length / skip);

    // for stablecoin pools, we assume a +/- 1% range around current price
    // for non-stablecoin pools -> +/- 30%
    const pct = 0.3;
    const pctStablePool = 0.01;

    // assume an investment of 1e5 USD
    const investmentAmount = 1e5;
    let X = [];
    for (let i = 0; i <= pages; i++) {
      let promises = dataNow.slice(start, stop).map((p) => {
        const delta = p.stablecoin ? pctStablePool : pct;

        // for stablecoin pools need to set this to 1 (or veeery close to 1, otherwise the fees will be off)
        const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

        return EstimatedFees(
          p.id,
          priceAssumption,
          [p.token1_in_token0 * (1 - delta), p.token1_in_token0 * (1 + delta)], // -/+ 30% of the current price
          p.price1,
          p.price0,
          investmentAmount,
          p.token0.decimals,
          p.token1.decimals,
          p.feeTier,
          url
        );
      });
      X.push(await Promise.all(promises));
      start += skip;
      stop += skip;
    }
    X = X.flat();
    dataNow = dataNow.map((p, i) => ({
      ...p,
      fee: X[i],
      apy: ((X[i] * 365) / investmentAmount) * 100,
    }));
  }

  return dataNow.map((p) => {
    const symbol = p.symbol;
    const poolMeta = `${p.feeTier / 1e4}%`;
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;

    const feeTier = Number(poolMeta.replace('%', '')) * 10000;
    const url = `https://app.uniswap.org/#/add/${token0}/${token1}/${feeTier}?chain=${chain}`;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'uniswap-v3',
      poolMeta,
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy,
      underlyingTokens,
      url,
    };
  });
};

const main = async (timestamp = null) => {
  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    data.push(await topLvl(chain, url, query, queryPrior, 'v3', timestamp));
  }
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
