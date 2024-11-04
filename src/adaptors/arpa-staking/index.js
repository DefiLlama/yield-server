const sdk = require('@defillama/sdk');
const ARPA = '0xBA50933C268F567BDC86E1aC131BE072C6B0b71a';
const STAKING_CONTRACT = '0xee710f79aa85099e200be4d40cdf1bfb2b467a01';
const { ethers } = require('ethers');
const { getPrices } = require('../utils');

const calApy = (rewardRate, totalCommunityStakingAmount) =>
  (rewardRate / totalCommunityStakingAmount) *
  3600 *
  24 *
  365 *
  (1 - 0.05) *
  100;

const getApyReward = async () => {
  const [amount, rate] = await Promise.all([
    sdk.api.abi.call({
      chain: 'ethereum',
      target: STAKING_CONTRACT,
      abi: 'uint256:getTotalCommunityStakedAmount',
    }),
    sdk.api.abi.call({
      chain: 'ethereum',
      target: STAKING_CONTRACT,
      abi: 'uint256:getRewardRate',
    }),
  ]).then((values) =>
    values.some((ret) => !ret || !ret.output)
      ? null
      : values.map(({ output }) => ethers.utils.formatEther(output))
  );

  let apy = 0;

  if (rate && amount) {
    apy = calApy(rate, amount);
  }

  const floored = Math.floor(apy * 10e1) / 10e1;

  return { apyReward: floored, stakedAmount: amount || 0 };
};

const getApy = async () => {
  const [{ pricesBySymbol }, { apyReward, stakedAmount }] = await Promise.all([
    getPrices([ARPA], 'ethereum'),
    getApyReward(),
  ]);

  const apyBase = 0;
  const tvl = (pricesBySymbol['arpa'] || 0) * stakedAmount;

  return [
    {
      pool: `${STAKING_CONTRACT}-ethereum`,
      project: 'arpa-staking',
      symbol: 'ARPA',
      rewardTokens: [ARPA],
      underlyingTokens: [ARPA],
      tvlUsd: tvl,
      apyBase,
      apyReward,
      chain: 'Ethereum',
      url: 'https://staking.arpanetwork.io/en-US/stake?action=Stake',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
