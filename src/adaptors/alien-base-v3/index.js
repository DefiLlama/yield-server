const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const { EstimatedFees } = require('./estimateFee');
const { getAlbAprs, ALB, chainIds } = require('./albReward');
const { queryPrior, query, SUBGRAPH_URL } = require('./subgraphCalls');

const chain = 'base';

const fetchAndCombineAPR = async (chain, url, query, queryPrior, timestamp, stablecoins) => {
  const albPools = await topLvl(chain, url, query, queryPrior, 'v3', timestamp, stablecoins);
  const volumeUsd7dByPool = Object.fromEntries(
    albPools.map((p) => [p.pool.toLowerCase(), p.volumeUsd7d])
  );
  const bunniAPRResults = await getAlbAprs(chain, volumeUsd7dByPool);

  const combinedResults = [];

  albPools.forEach((albPool) => {
    const bunniAPR = bunniAPRResults.find((bunni) => bunni.pool === albPool.pool);

    combinedResults.push({
      ...albPool,
      apyBase: albPool.apyBase,
      apyReward: albPool.apyReward || 0,
      rewardTokens: albPool.rewardTokens || [],
      underlyingTokens: albPool.underlyingTokens,
    });

    if (bunniAPR) {
      combinedResults.push({
        ...albPool,
        pool: bunniAPR.bunniToken,
        apyBase: bunniAPR.apyBase,
        tvlUsd: bunniAPR.tvlUsd,
        apyReward: bunniAPR.apyReward,
        rewardTokens: bunniAPR.rewardTokens || [],
        poolMeta: bunniAPR.poolMeta,
        underlyingTokens: albPool.underlyingTokens,
      });
    }
  });

  bunniAPRResults.forEach((bunniAPR) => {
    if (!combinedResults.find((r) => r.pool === bunniAPR.bunniToken)) {
      combinedResults.push({
        pool: bunniAPR.bunniToken,
        chain: bunniAPR.chain,
        symbol: bunniAPR.symbol,
        project: bunniAPR.project,
        apyBase: bunniAPR.apyBase,
        apyReward: bunniAPR.apyReward,
        rewardTokens: bunniAPR.rewardTokens,
        underlyingTokens: bunniAPR.underlyingTokens,
        url: bunniAPR.url,
        tvlUsd: bunniAPR.tvlUsd,
        poolMeta: bunniAPR.poolMeta,
      });
    }})

  return combinedResults;
};

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
    const timestampForBlocks =
      timestamp != null ? Number(timestamp) : Math.floor(Date.now() / 1000);
    const [[block, blockPrior], [blockPrior7d]] = await Promise.all([
      utils.getBlocks(chainString, timestamp, [url]),
      utils.getBlocksByTime([timestampForBlocks - 604800], chainString),
    ]);

    // pull data
    let queryC = query;
    let queryPriorC = queryPrior;
    let [dataNow, dataPrior, dataPrior7d] = await Promise.all([
      request(url, queryC.replace('<PLACEHOLDER>', block)),
      request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior)),
      request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d)),
    ]);
    dataNow = dataNow.pools;
    dataPrior = dataPrior.pools;
    dataPrior7d = dataPrior7d.pools;
    // console.log('dataNow', dataNow);

    dataNow = dataNow.map((p) => {
      return {
        ...p,
        reserve0: p.totalValueLockedToken0,
        reserve1: p.totalValueLockedToken1,
      };
    });

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= utils.MIN_TVL_USD
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = `${p.token0.symbol}-${p.token1.symbol}`;
      const stablecoin = utils.checkStablecoin(
        { ...p, symbol: utils.formatSymbol(symbol) },
        stablecoins
      );
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

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

      // assume an investment of 1e5 USD
      const investmentAmount = 1e5;

      // tick range
      const pct = 0.3;
      const pctStablePool = 0.001;

      dataNow = dataNow.map((p) => {
        if (!p.liquidity) {
          console.log(`No pool liquidity found for ${p.id}`);
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
          p.liquidity
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
      const url = `https://app.alienbase.xyz/add/${token0}/${token1}/${feeTier}?chainId=${chainId}`;

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'alien-base-v3',
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
  if (!timestamp) {
    timestamp = Math.floor(Date.now() / 1000);
  }
  const stablecoins = (
    await axios.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).data.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

    const combinedResults = await fetchAndCombineAPR(
      chain,
      SUBGRAPH_URL,
      query,
      queryPrior,
      timestamp,
      stablecoins
    );

    // console.log('Returning:', combinedResults.flat().filter((p) => utils.keepFinite(p)));
  
    return combinedResults
      .flat()
      .filter((p) => utils.keepFinite(p));
  };

module.exports = {
  protocolId: '3888',
  timetravel: false,
  apy: main,
};
