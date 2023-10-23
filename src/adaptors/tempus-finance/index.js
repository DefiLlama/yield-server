const { default: BigNumber } = require('bignumber.js');
const axios = require('axios');
const sdk = require('@defillama/sdk4');
const tempStaking = require('./abis/TempStaking.json');

const STAKING = '0x6C6D4753a1107585121599746c2E398cCbEa5119';
const TEMP = '0xA36FDBBAE3c9d55a1d67EE5821d53B50B63A1aB9';
const RAFT = '0x4C5Cb5D87709387f8821709f7a6664f00DcF0C93';

async function getEstimatedApy(
  rewardPerSecond,
  timeMultiplierIncreasePerSec,
  stakeAmount,
  totalTempStaked,
  tempPrice,
  raftPrice,
  stakeStart,
  stakeEnd
) {
  // rewards = (stakeAmount / (stakeAmount + totalTempStaked)) * rewardsPerSecond * (stakeEnd - stakeStart) * (1 + timeMultiplierIncreasePerSec * (stakeEnd - stakeStart));
  const rewards = stakeAmount
    .times(1e18)
    .div(stakeAmount.plus(totalTempStaked))
    .times(rewardPerSecond)
    .div(1e18)
    .times(stakeEnd - stakeStart)
    .times(
      BigNumber(1).plus(
        timeMultiplierIncreasePerSec.times(stakeEnd - stakeStart).div(1e18)
      )
    );

  // apr = rewards * (raftPrice / tempPrice) * (SECONDS_IN_A_YEAR / stakeEnd) / stakeAmount;
  return rewards
    .times(raftPrice / tempPrice)
    .times((60 * 60 * 24 * 365) / stakeEnd)
    .div(stakeAmount);
}

async function getTokenPrice(token) {
  const networkTokenPair = `ethereum:${token}`;
  return (
    await axios.get(`https://coins.llama.fi/prices/current/${networkTokenPair}`)
  ).data.coins[networkTokenPair].price;
}

async function apy() {
  const totalStaked = BigNumber(
    (
      await sdk.api.abi.call({
        target: STAKING,
        abi: tempStaking.totalStakedSupply,
      })
    ).output
  );
  const rewardPerSecond = BigNumber(
    (
      await sdk.api.abi.call({
        target: STAKING,
        abi: tempStaking.rewardPrograms,
        params: [RAFT],
      })
    ).output.rewardPerSecond
  );
  const timeMultiplierIncreasePerSec = BigNumber(
    (
      await sdk.api.abi.call({
        target: STAKING,
        abi: tempStaking.timeMultiplierIncreasePerSec,
      })
    ).output
  );
  const tempPrice = await getTokenPrice(TEMP);
  const raftPrice = await getTokenPrice(RAFT);

  const apy = await getEstimatedApy(
    rewardPerSecond,
    timeMultiplierIncreasePerSec,
    BigNumber(1),
    totalStaked,
    tempPrice,
    raftPrice,
    0,
    1
  );
  const totalStakedUsd = totalStaked.times(tempPrice).div(1e18).toNumber();

  return [
    {
      pool: `${STAKING}-${RAFT}`.toLowerCase(),
      project: 'tempus-finance',
      symbol: 'TEMP',
      chain: 'Ethereum',
      poolMeta: 'TEMP Staking',
      apyReward: apy.toNumber() * 100,
      rewardTokens: [RAFT],
      tvlUsd: totalStakedUsd,
    },
  ];
}

module.exports = {
  apy,
  url: 'https://stake.tempus.finance/',
};
