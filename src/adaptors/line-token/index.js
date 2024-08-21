const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const utils = require('../utils');

const {
  LINE_CONTRACT_ADDRESS,
  CHAIN,
  PROJECT,
  COLLATERAL_TOKEN_CONTRACT_ADDRESS,
} = require('./config');
const {
  getCurrentLinePrice,
  getAllPools,
  getTotalDebt,
  getInterestRate,
  getPoolTokenPriceInUSD,
  fetchPriceFromCoingecko,
  getSymbol,
  getDecimals,
} = require('./utils');

const COMMON_DATA = {
  chain: CHAIN,
  project: PROJECT,
  rewardTokens: [LINE_CONTRACT_ADDRESS],
};

const apy = async () => {
  const pools = await getAllPools();
  const linePriceInCollateralToken = await getCurrentLinePrice();
  const collateralTokenPriceInUSD = await fetchPriceFromCoingecko(
    COLLATERAL_TOKEN_CONTRACT_ADDRESS
  );
  const lineTokenPriceInUSD = BigNumber(linePriceInCollateralToken)
    .multipliedBy(collateralTokenPriceInUSD)
    .dividedBy(10 ** 18)
    .toNumber();
  const collateralDecimals = await getDecimals(
    COLLATERAL_TOKEN_CONTRACT_ADDRESS
  );
  const lineDecimals = await getDecimals(LINE_CONTRACT_ADDRESS);

  const totalDebt = await getTotalDebt();
  const interestRate = await getInterestRate();

  const totalRewardPerYear = BigNumber(interestRate)
    .multipliedBy(totalDebt)
    .dividedBy('10000')
    .dividedBy(10 ** lineDecimals)
    .toNumber();

  const results = [];

  for (const pool of pools) {
    const { reward_share10000, total_staked_in_pool, poolContractAddress } =
      pool;
    const poolTokenDecimals = await getDecimals(poolContractAddress);

    const totalStakedInPool = BigNumber(total_staked_in_pool)
      .dividedBy(10 ** poolTokenDecimals)
      .toNumber();

    const poolRewardPerYear = totalRewardPerYear * (reward_share10000 / 1e4);

    const stakedTokenPriceInUSD = await getPoolTokenPriceInUSD(
      poolContractAddress,
      lineTokenPriceInUSD
    );

    if (!Number(collateralTokenPriceInUSD) || !Number(stakedTokenPriceInUSD))
      continue;

    const poolRewardPerYearInUSD = poolRewardPerYear * lineTokenPriceInUSD;

    const apy =
      poolRewardPerYearInUSD / (totalStakedInPool * stakedTokenPriceInUSD);

    const tvlUsd = totalStakedInPool * stakedTokenPriceInUSD;
    const symbol = await getSymbol(poolContractAddress);

    results.push({
      apy,
      tvlUsd,
      ...COMMON_DATA,
      pool: `${poolContractAddress}-${CHAIN}`.toLowerCase(),
      symbol: utils.formatSymbol(symbol),
    });
  }

  return results;
};

module.exports = {
  timetravel: false,
  url: 'https://linetoken.org/staking/all',
  apy,
};
