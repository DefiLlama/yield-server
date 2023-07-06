const BigNumber = require('bignumber.js');
const utils = require('../utils');

const BAKING_REWARD_PERCENT = 5.5;
const PERCENT_EXP = 10 ** 2;
const TZBTC_EXP = 10 ** 8;
const XTZ_EXP = 10 ** 6;

const tzbtcContractAddress = 'KT1WL6sHt8syFT2ts7NCmb5gPcS2tyfRxSyi';
const xtzContractAddress = 'KT19qWdPBRtkWrsQnDvVfsqJgJB19keBhhMX';
const chain = utils.formatChain('Tezos');

const calcTotalSupply = (deposit, depositIndex, rate, EXP, tenth) => {
  const totalSupply = new BigNumber(deposit)
    .times(depositIndex)
    .div(EXP)
    .toFixed(tenth);
  const totalSupplyUSD = new BigNumber(totalSupply).times(rate).toFixed(2);
  return { totalSupply, totalSupplyUSD };
};

const calcTotalBorrow = (grossCredit, grossCreditIndex, rate, EXP, tenth) => {
  const totalBorrow = new BigNumber(grossCredit)
    .times(grossCreditIndex)
    .div(EXP)
    .toFixed(tenth);
  const totalBorrowUSD = new BigNumber(totalBorrow).times(rate).toFixed(2);
  return { totalBorrow, totalBorrowUSD };
};

const calcUtilization = (totalBorrow, totalSupply) => {
  const utilization =
    totalBorrow === 0
      ? 0
      : new BigNumber(totalBorrow)
          .div(totalSupply)
          .times(PERCENT_EXP)
          .toFixed(4);
  if (utilization > 100) {
    return 100;
  }
  return utilization;
};

const calcXtzBakingRewards = (utilization) =>
  new BigNumber(BAKING_REWARD_PERCENT)
    .times(1 - utilization / PERCENT_EXP)
    .toFixed(4);

const calcXtzRate = (bakingRewards, savingsRate) =>
  new BigNumber(bakingRewards).plus(savingsRate).toFixed(2);

function getTzbtcLendPool(data) {
  const { totalSupplyUSD } = calcTotalSupply(
    data['contractInfo'][0]['tzbtcDeposit'],
    data['contractInfo'][0]['tzbtcDepositIndex'],
    data['externalInfo'][0]['tzbtcRate'],
    TZBTC_EXP,
    8
  );

  const { totalBorrowUSD } = calcTotalBorrow(
    data['contractInfo'][0]['tzbtcGrossCredit'],
    data['contractInfo'][0]['tzbtcGrossCreditIndex'],
    data['externalInfo'][0]['tzbtcRate'],
    TZBTC_EXP,
    8
  );

  const tvlUsd = new BigNumber(totalSupplyUSD).minus(totalBorrowUSD).toFixed(2);
  const apyBase = new BigNumber(
    data['contractInfo'][0]['tzbtcDepositRate']
  ).toFixed(2);

  return {
    pool: `${tzbtcContractAddress}-${chain}`.toLowerCase(),
    chain: chain,
    project: 'kordfi',
    symbol: utils.formatSymbol('TZBTC'),
    tvlUsd: tvlUsd,
    url: 'https://kord.fi/lend',
    apyBase: apyBase,
    totalSupplyUsd: totalSupplyUSD,
    totalBorrowUsd: totalBorrowUSD,
    underlyingTokens: ['KT1PWx2mnDueood7fEmfbBDKx1D9BAnnXitn'],
  };
}

function getXtzLendPool(data) {
  const { totalSupply, totalSupplyUSD } = calcTotalSupply(
    data['contractInfo'][0]['xtzDeposit'],
    data['contractInfo'][0]['xtzDepositIndex'],
    data['externalInfo'][0]['xtzRate'],
    XTZ_EXP,
    6
  );

  const { totalBorrow, totalBorrowUSD } = calcTotalBorrow(
    data['contractInfo'][0]['xtzGrossCredit'],
    data['contractInfo'][0]['xtzGrossCreditIndex'],
    data['externalInfo'][0]['xtzRate'],
    XTZ_EXP,
    6
  );

  const tvlUsd = new BigNumber(totalSupplyUSD).minus(totalBorrowUSD).toFixed(2);
  const utilization = calcUtilization(totalBorrow, totalSupply);
  const bakingRewards = calcXtzBakingRewards(utilization);
  const rate = calcXtzRate(
    bakingRewards,
    data['contractInfo'][0]['xtzDepositRate']
  );

  return {
    pool: `${xtzContractAddress}-${chain}`.toLowerCase(),
    chain: chain,
    project: 'kordfi',
    symbol: utils.formatSymbol('XTZ'),
    tvlUsd: tvlUsd,
    url: 'https://kord.fi/lend',
    apyBase: rate,
    totalSupplyUsd: totalSupplyUSD,
    totalBorrowUsd: totalBorrowUSD,
  };
}

module.exports = {
  getTzbtcLendPool,
  getXtzLendPool,
};
