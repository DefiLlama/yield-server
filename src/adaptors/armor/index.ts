const utils = require('../utils');

const API_URL: string = 'https://armorfi.info/api/apy';

const ARMOR_TOKEN = '0x1337def16f9b486faed0293eb623dc8395dfe46a';

interface Pool {
  contract_address: string;
  asset_symbol: string;
  quote_symbol: string;
  liquidity_usd: string;
  apy: { yearly: string };
}

interface Response {
  dailyapys: Array<Pool>;
}

const getApy = async () => {
  const { dailyapys: poolsRes }: Response = await utils.getData(API_URL);

  const pools = poolsRes.map((pool) => {
    return {
      pool: pool.contract_address,
      chain: utils.formatChain('ethereum'),
      project: 'armor',
      symbol: `${pool.asset_symbol}-${pool.quote_symbol}`,
      tvlUsd: Number(pool.liquidity_usd),
      apyReward: Number(pool.apy.yearly),
      rewardTokens: [ARMOR_TOKEN],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
