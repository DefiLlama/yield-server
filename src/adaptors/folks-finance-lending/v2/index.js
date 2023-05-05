const {
  maximum,
  getAppState,
  getParsedValueFromState,
  calculateInterestYield,
  interestRateToPercentage,
  calculateVariableBorrowInterestYield,
  fromIntToByteHex,
  calcDepositInterestIndex,
  parseUint64s,
  calcWithdrawReturn,
  transformPrice,
  getRewardInterestRate,
} = require('./utils');
const { pools } = require('./constants');
const { getCachedPrices } = require('./prices');

const REWARD_APP_ID = 1093729103;

async function retrievePoolInfo({ poolAppId, poolAssetId }) {
  const state = await getAppState(poolAppId);

  if (state === undefined)
    return {
      depositsUsd: 0,
      borrowsUsd: 0,
    };

  const prices = await getCachedPrices();
  const price = prices[poolAssetId];
  if (price === undefined) return { depositsUsd: 0, borrowsUsd: 0 };

  const varBor = parseUint64s(String(getParsedValueFromState(state, 'v')));
  const stblBor = parseUint64s(String(getParsedValueFromState(state, 's')));
  const interest = parseUint64s(String(getParsedValueFromState(state, 'i')));

  const variableBorrowAmountUsd = Number(varBor[3]) * transformPrice(price);
  const stableBorrowAmountUsd = Number(stblBor[8]) * transformPrice(price);
  const borrowsAmountUsd = variableBorrowAmountUsd + stableBorrowAmountUsd;

  const depositsAmountUsd = Number(interest[3]) * transformPrice(price);

  const depositInterestYield = calculateInterestYield(interest[4]);
  const depositInterestRate = interest[4];

  const depositInterestIndex = calcDepositInterestIndex(
    interest[4],
    interest[5],
    interest[6]
  );

  const variableBorrowInterestYield = calculateVariableBorrowInterestYield(
    varBor[4]
  );

  // combine
  return {
    depositsUsd: depositsAmountUsd,
    borrowsUsd: borrowsAmountUsd,
    depositInterestYield,
    depositInterestRate,
    depositInterestIndex,
    variableBorrowInterestYield,
  };
}

async function getStakingProgram() {
  const state = await getAppState(REWARD_APP_ID);

  if (state === undefined) return;
  const stakingPrograms = [];
  for (let i = 0; i <= 5; i++) {
    const prefix = 'S'.charCodeAt(0).toString(16);
    const stakeBase64Value = String(
      (0, getParsedValueFromState)(
        state,
        prefix + (0, fromIntToByteHex)(i),
        'hex'
      )
    );
    const stakeValue = Buffer.from(stakeBase64Value, 'base64').toString('hex');
    for (let j = 0; j <= 4; j++) {
      const basePos = j * 46;
      const rewards = [];
      stakingPrograms.push({
        poolAppId: Number('0x' + stakeValue.slice(basePos, basePos + 12)),
        totalStaked: BigInt(
          '0x' + stakeValue.slice(basePos + 12, basePos + 28)
        ),
        minTotalStaked: BigInt(
          '0x' + stakeValue.slice(basePos + 28, basePos + 44)
        ),
        stakeIndex: i * 5 + j,
        numRewards: Number('0x' + stakeValue.slice(basePos + 44, basePos + 46)),
        rewards,
      });
    }
  }
  for (let i = 0; i <= 22; i++) {
    const prefix = 'R'.charCodeAt(0).toString(16);
    const rewardBase64Value = String(
      (0, getParsedValueFromState)(
        state,
        prefix + (0, fromIntToByteHex)(i),
        'hex'
      )
    );
    const rewardValue = Buffer.from(rewardBase64Value, 'base64').toString(
      'hex'
    );
    for (let j = 0; j <= (i !== 22 ? 3 : 1); j++) {
      const basePos = j * 60;
      const stakeIndex = Number(BigInt(i * 4 + j) / BigInt(3));
      const localRewardIndex = Number(BigInt(i * 4 + j) % BigInt(3));
      const { totalStaked, minTotalStaked, rewards, numRewards } =
        stakingPrograms[stakeIndex];
      if (localRewardIndex >= numRewards) continue;
      const ts = (0, maximum)(totalStaked, minTotalStaked);
      const endTimestamp = BigInt(
        '0x' + rewardValue.slice(basePos + 12, basePos + 20)
      );
      const lu = BigInt('0x' + rewardValue.slice(basePos + 20, basePos + 28));
      const rewardRate = BigInt(
        '0x' + rewardValue.slice(basePos + 28, basePos + 44)
      );
      const rpt = BigInt('0x' + rewardValue.slice(basePos + 44, basePos + 60));
      const currTime = BigInt((0, Math.floor(Date.now() / 1000)));
      const dt =
        currTime <= endTimestamp
          ? currTime - lu
          : lu <= endTimestamp
          ? endTimestamp - lu
          : BigInt(0);
      const rewardPerToken = rpt + (rewardRate * dt) / ts;

      const rewardAssetId = Number(
        '0x' + rewardValue.slice(basePos, basePos + 12)
      ).toString();

      rewards.push({
        rewardAssetId,
        endTimestamp,
        rewardRate,
        rewardPerToken,
      });
    }
  }

  return stakingPrograms.filter((program) => program.poolAppId !== 0);
}

async function getPoolsInfo(pool) {
  const poolInfo = await retrievePoolInfo({
    poolAppId: pool.appId,
    poolAssetId: pool.assetId,
  });
  return poolInfo;
}

async function getDepositStakingProgramsInfo(
  depositStakingInfo,
  poolInfo,
  pool
) {
  const rewardTokens = [];
  let apyReward = 0;
  const prices = await getCachedPrices();
  const { poolAppId, totalStaked, minTotalStaked, rewards, stakeIndex } =
    depositStakingInfo;

  if (pool === undefined || poolInfo === undefined)
    throw Error('Could not find pool ' + poolAppId);
  const { assetId, fAssetId } = pool;
  const { depositInterestIndex, depositInterestRate, depositInterestYield } =
    poolInfo;

  const assetPrice = prices[assetId];
  if (assetPrice === undefined)
    throw Error('Could not find asset price ' + assetId);

  const fAssetTotalStakedAmount = maximum(totalStaked, minTotalStaked);
  const assetTotalStakedAmount = calcWithdrawReturn(
    fAssetTotalStakedAmount,
    depositInterestIndex
  );

  rewards.forEach(
    ({ rewardAssetId, endTimestamp, rewardRate, rewardPerToken }) => {
      const rewardAssetPrice = prices[rewardAssetId];
      if (rewardAssetPrice === undefined)
        throw Error('Could not find asset price ' + rewardAssetId);

      const stakedAmountValue = assetTotalStakedAmount * assetPrice;
      const rewardInterestRate = getRewardInterestRate(
        stakedAmountValue,
        rewardRate,
        rewardAssetPrice,
        endTimestamp
      );
      rewardTokens.push(rewardAssetId.toString());
      apyReward += interestRateToPercentage(rewardInterestRate);
    }
  );
  return { apyReward, rewardTokens };
}

module.exports = {
  getStakingProgram,
  getPoolsInfo,
  getDepositStakingProgramsInfo,
};
