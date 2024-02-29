const utils = require('../utils');

type V2Aggregator = {
  address: `0x${string}`;
  asset: {
    symbol: string;
    address: `0x${string}`;
  }
  tvl: number;
  baseAPY: number;
  rewardsAPY: number;
  rewardTokens: `0x${string}`[];
};

const aggregators = async () => {
  const data = await utils.getData(
    `https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/v2Aggregators`
  ) as V2Aggregator[];

  return data.map((p) => {
    const apyReward = p.rewardsAPY * 100;
    const apyBase = p.baseAPY * 100;

    return {
      pool: p.address,
      chain: 'ethereum',
      project: 'sturdy-v2',
      symbol: utils.formatSymbol(p.asset.symbol),
      tvlUsd: p.tvl,
      apyBase,
      apyReward,
      rewardTokens: p.rewardTokens,
      url: `https://v2.sturdy.finance/aggregators/ethereum/${p.address}`,
      underlyingTokens: [p.asset.address],
    };
  });
};

module.exports = {
  timetravel: false,
  apy: aggregators,
  url: 'https://v2.sturdy.finance/aggregators/ethereum',
};
