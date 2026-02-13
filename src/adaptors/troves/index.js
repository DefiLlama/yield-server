const utils = require('../utils');

const STARKNET_ADDR_LEN = 66; // 0x + 64 hex chars
const padStarknetAddress = (addr) => {
  if (!addr || !addr.startsWith('0x')) return addr;
  const hex = addr.slice(2);
  if (hex.length >= 64) return addr;
  return '0x' + hex.padStart(64, '0');
};

const apy = async () => {
  const apyData = await utils.getData(
    'https://app.strkfarm.com/api/strategies'
  );

  return apyData.strategies
    .filter((strategy) => parseFloat(strategy.tvlUsd) > 10000)
    .map((strategy) => {
      const currTvlUsd = parseFloat(strategy.tvlUsd);
      const currPool = strategy.name;
      const currPoolId = strategy.id;
      const baseApy = (strategy.apySplit.baseApy || 0) * 100;
      const rewardsApy = (strategy.apySplit.rewardsApy || 0) * 100;
      const rewardTokens = strategy.depositToken.map((token) =>
        padStarknetAddress(token.address)
      );
      const underlyingTokens = strategy.depositToken.map((token) =>
        padStarknetAddress(token.address)
      );
      const symbols = strategy.depositToken
        .map((token) => token.symbol)
        .join('-');

      return {
        pool: currPoolId,
        chain: 'Starknet',
        project: 'troves',
        symbol: symbols,
        underlyingTokens: underlyingTokens,
        tvlUsd: currTvlUsd,
        apyBase: baseApy,
        apyReward: rewardsApy,
        rewardTokens: rewardTokens,
        url: `https://app.strkfarm.com/strategy/${currPoolId}`,
        poolMeta: currPool,
      };
    });
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://www.troves.fi/',
};
