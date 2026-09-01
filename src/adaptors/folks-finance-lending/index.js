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

const buildDataSource = async (poolArr, depositsStakingInfo, loanType) => {
  const loanAppId = constants.MainnetLoans[loanType];
  const { pools: poolsLoanInfo } = await retrieveLoanInfo(loanAppId);
  for (const pool of pools.filter((p) => p.loanType === loanType)) {
    const poolInfo = await getPoolsInfo(pool);
    const {
      depositsUsd,
      borrowsUsd,
      depositInterestYield,
      variableBorrowInterestYield,
      availableBorrowUsd,
      deprecated,
    } = poolInfo;
    if (deprecated) continue;
    const poolLoanInfo = poolsLoanInfo[pool.appId];
    if (!poolLoanInfo) continue;
    const totalSupplyUsd = Number(depositsUsd.toFixed(2));
    const totalBorrowUsd = Number(borrowsUsd.toFixed(2));
    const tvlUsd = Number((depositsUsd - borrowsUsd).toFixed(2));
    const apyBase = interestRateToPercentage(depositInterestYield);
    const apyBaseBorrow = interestRateToPercentage(variableBorrowInterestYield);
    const ltv = ratioToPercentage(poolLoanInfo.collateralFactor);
    const borrowable = poolLoanInfo.borrowFactor > 0n;

    let dataSource = {
      pool: `${pool.appId}-algorand`,
      chain: utils.formatChain('algorand'),
      project: 'folks-finance-lending',
      symbol: pool.symbol,
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      borrowToken: String(pool.assetId == 0 ? 1 : pool.assetId),
      ltv,
      borrowable,
      availableBorrowUsd,
      underlyingTokens: [String(pool.assetId == 0 ? 1 : pool.assetId)],
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
}

const poolsFunction = async () => {
  let poolArr = [];

  const depositsStakingInfo = await getStakingProgram();

  await buildDataSource(poolArr, depositsStakingInfo, constants.LoanType.GENERAL);
  await buildDataSource(poolArr, depositsStakingInfo, constants.LoanType.ALGORAND_ECOSYSTEM);

  return poolArr;
};

module.exports = {
  protocolId: '1642',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.folks.finance/',
};
