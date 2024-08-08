const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: axios } = require('axios');

const getPoolsTvl = async (balances) => {
  const allPoolsTVLRaw = await (
    await axios.get('https://api-insights.carbon.network/pool/liquidity')
  ).data;
  const lastIndex = allPoolsTVLRaw?.result?.entries?.length - 1;
  return allPoolsTVLRaw?.result?.entries[lastIndex]?.pools ?? [];
};

const apr = async () => {
  const poolsRaw = await utils.getData(
    'https://api-insights.carbon.network/pool/apy'
  );
  const tokens = await (
    await utils.getData(
      'https://api.carbon.network/carbon/coin/v1/tokens?pagination.limit=10000'
    )
  ).tokens;
  const pools = poolsRaw?.result?.entries;
  const result = [];

  const balances = {};
  const poolsTVL = await getPoolsTvl(balances);

  for (const pool of pools) {
    const tokenAInfo = tokens.find((o) => o.denom === pool.denomA);
    const tokenBInfo = tokens.find((o) => o.denom === pool.denomB);
    const symbol = `${tokenAInfo.symbol.toUpperCase()}-${tokenBInfo.symbol.toUpperCase()}`;
    const poolTVL = poolsTVL.find((o) => o.poolId === pool.id)?.amountValue;
    result.push({
      pool: pool.denom.toString(),
      chain: utils.formatChain('Carbon'),
      project: 'demex',
      symbol: symbol,
      tvlUsd: poolTVL ?? 0,
      apy: Number(pool.apy),
      rewardTokens: ['swth'],
      underlyingTokens: [pool.denomA, pool.denomB],
    });
  }
  return result;
};

module.exports = {
  timetravel: false,
  apy: apr,
  url: 'https://app.dem.exchange/pools',
};
