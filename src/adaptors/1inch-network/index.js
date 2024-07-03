const utils = require('../utils');
// test3

const ADDRESSES = {
  ethereum: {
    '1INCH': '0x111111111117dc0aa78b770fa6a738034120c302',
    dst1INCH: '0x9a0c8ff858d273f57072d714bca7411d717501d7',
  },
};

const main = async () => {
  const data = await utils.getData(
    'https://data-distributor.1inch.io/resolversMetrics'
  );
  const result = Object.values(data)[0].map((pool) => {
    const apyReward = Number(pool.apyBase);

    return {
      pool: `1INCH-${pool.resolver_address}-${pool.chain}`.toLowerCase(),
      chain: utils.formatChain(pool.chain),
      project: '1inch-network',
      symbol: '1INCH',
      poolMeta: pool.pool,
      tvlUsd: Number(pool.tvlUsd),
      apyReward,
      url: `https://app.1inch.io/#/1/earn/delegate/${pool.resolver_address}`,
      rewardTokens:
        apyReward > 0 ? [ADDRESSES[pool.chain.toLowerCase()]['1INCH']] : [],
      underlyingTokens: [
        ADDRESSES[pool.chain.toLowerCase()]['1INCH'],
        ADDRESSES[pool.chain.toLowerCase()]['dst1INCH'],
      ],
    };
  });
  return result;
};

module.exports = {
  timetravel: false,
  apy: main,
  // url: "https://app.1inch.io/#/1/dao/staking",
};
