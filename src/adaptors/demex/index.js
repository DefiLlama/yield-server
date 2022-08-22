const utils = require('../utils');
const sdk = require("@defillama/sdk");
const { default: axios } = require('axios');

const getPoolsTvl = async (balances) => {
  const allPoolsTVLRaw =  await (await axios.get("https://api-insights.carbon.network/pool/liquidity")).data
  const lastIndex = allPoolsTVLRaw?.result?.entries?.length - 1
  return allPoolsTVLRaw?.result?.entries[lastIndex]?.pools ?? []
}

const apr = async () => {
  const poolsRaw = await utils.getData(
    'https://api-insights.carbon.network/pool/apy'
  );

  const pools = poolsRaw?.result?.entries;
  const result = [];

  const balances = {};
  const poolsTVL = await getPoolsTvl(balances);

  for (const pool of pools) {
    const name = pool.name.replace(/[0-9]/g, '').replace("_", "-");
    const denomARaw = pool.denomA.split(".")[0];
    const denomBRBw = pool.denomB.split(".")[0];
    const symbol = `${denomARaw.toUpperCase()}-${denomBRBw.toUpperCase()}`;
    const poolTVL = poolsTVL.find((o) => o.poolId === pool.id)?.amountValue;
    result.push({
      pool: pool.denom.toString(),
      chain: utils.formatChain('Carbon'),
      project: 'demex',
      poolMeta: pool.name,
      symbol: pool.name.replace(/[0-9]/g, '').replace("_","-"),
      tvlUsd: poolTVL ?? 0,
      apy: Number(pool.apy),
      rewardTokens: ["swth"],
      underlyingTokens: [
        pool.denomA,
        pool.denomB
      ],
    });
  }
  return result;
};

module.exports = {
  timetravel: false,
  apy: apr,
  url: 'https://app.dem.exchange/pools',
};
