const constants = require('./v2/constants');
const {
  getStakingProgram,
  getPoolsInfo,
  getDepositStakingProgramsInfo,
  retrieveLoanInfo,
} = require('./v2/index');
const { interestRateToPercentage, ratioToPercentage } = require('./v2/utils');
const utils = require('../utils');

const { pools } = constants;

const poolsFunction = async () => {
  let poolArr = [];

  const depositsStakingInfo = await getStakingProgram();
  const { pools: poolsLoanInfo } = await retrieveLoanInfo();
  for (const pool of pools) {
    const poolInfo = await getPoolsInfo(pool);
    const {
      depositsUsd,
      borrowsUsd,
      depositInterestYield,
      variableBorrowInterestYield,
    } = poolInfo;
    const totalSupplyUsd = Number(depositsUsd.toFixed(2));
    const totalBorrowUsd = Number(borrowsUsd.toFixed(2));
    const tvlUsd = Number((depositsUsd - borrowsUsd).toFixed(2));
    const apyBase = interestRateToPercentage(depositInterestYield);
    const apyBaseBorrow = interestRateToPercentage(variableBorrowInterestYield);
    const ltv = ratioToPercentage(poolsLoanInfo[pool.appId].collateralFactor);

    let dataSource = {
      pool: `${pool.appId}-algorand`,
      chain: utils.formatChain('algorand'),
      project: 'folks-finance-lending',
      symbol: utils.formatSymbol(pool.symbol),
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      ltv,
    };

    if (pool.hasReward) {
      const depositStakingInfo = depositsStakingInfo.find(
        (deposit) => deposit.poolAppId === pool.appId
      );

      const dataSourceRewards = await getDepositStakingProgramsInfo(
        depositStakingInfo,
        poolInfo,
        pool
      );
      dataSource = { ...dataSource, ...dataSourceRewards };
    }

    poolArr.push(dataSource);
  }
  return poolArr;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.folks.finance/',
};
