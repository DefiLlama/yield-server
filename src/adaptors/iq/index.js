const sdk = require('@defillama/sdk');
const utils = require('../utils');
const IqAbi = require('./abi');

const token = '0x1bf5457ecaa14ff63cc89efd560e251e814e16ba';

const getApy = async () => {
  const dataTvl = await utils.getData('https://api.llama.fi/protocol/iq');

  const totalHiiq =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const REWARDS_FOR_THE_FIRST_YEAR = 1095000000;

  const getTotalIQMintedPerYear = (year = 0) => {
    const newModelStartDate = new Date('November 1, 2022');
    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + year);
    const diffInMiliseconds =
      currentDate.getTime() - newModelStartDate.getTime();
    const yearsOfDifference = Math.abs(
      new Date(diffInMiliseconds).getUTCFullYear() - 1970
    );
    if (yearsOfDifference === 0) return REWARDS_FOR_THE_FIRST_YEAR;
    return REWARDS_FOR_THE_FIRST_YEAR / 2 ** yearsOfDifference;
  };

  const calculateUserPoolRewardOverTheYear = (
    years,
    userTotalHiiq,
    totalHIIQ
  ) => {
    let totalPoolReward = 0;
    for (let i = 0; i < years; i += 1) {
      const totalIQMintedEachYear = getTotalIQMintedPerYear(i);
      const userPoolRationForTheYear =
        (userTotalHiiq / (totalHIIQ + userTotalHiiq)) * totalIQMintedEachYear;
      totalPoolReward += userPoolRationForTheYear;
    }
    return totalPoolReward;
  };

  const calculateStakeReward = (
    totalHiiq,
    amountLocked,
    years,
    poolRewardCalculationYear
  ) => {
    const yearsLocked = years;
    const rewardsBasedOnLockPeriod =
      amountLocked + amountLocked * 3 * (yearsLocked / 4);
    const totalPoolRewardForTheLockYear = calculateUserPoolRewardOverTheYear(
      poolRewardCalculationYear,
      rewardsBasedOnLockPeriod,
      totalHiiq
    );
    return totalPoolRewardForTheLockYear;
  };

  const calculateAPR = () => {
    const amountLocked =
      Number(dataTvl.currentChainTvls['staking']) / Number(dataTvl.tokenPrice);
    const stakeReward = calculateStakeReward(totalHiiq, amountLocked, 4, 1);
    const aprDividedByLockPeriod = (stakeReward / totalHiiq) * 100;
    return aprDividedByLockPeriod;
  };

  return [
    {
      pool: token,
      chain: utils.formatChain('ethereum'),
      project: 'braindao',
      symbol: 'hiiq',
      tvlUsd: Number(dataTvl.currentChainTvls['staking']),
      apy: calculateAPR(),
      underlyingTokens: [dataTvl.address],
      poolMeta: `Lock IQ, Earn Hiiq`,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://iq.braindao.org/dashboard/stake',
};
