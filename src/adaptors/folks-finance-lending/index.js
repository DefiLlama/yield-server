const constants = require('./v2/constants');
const {
  getStakingProgram,
  getPoolsInfo,
  getDepositStakingProgramsInfo,
} = require('./v2/index');
const { interestRateToPercentage } = require('./v2/utils');
const utils = require('../utils');

const { pools } = constants;

const poolsFunction = async () => {
  let poolArr = [];

  const depositsStakingInfo = await getStakingProgram();

  pools.forEach(async (pool) => {
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

    let dataSource = {
      pool: `${pool.appId}-algorand`,
      chain: utils.formatChain('algorand'),
      project: 'folks-finance-lending',
      symbol: utils.formatSymbol(pool.symbol),
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase: interestRateToPercentage(depositInterestYield),
      apyBaseBorrow: interestRateToPercentage(variableBorrowInterestYield),
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
  });
  return poolArr;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.folks.finance/',
};
