const { add, multiply, divide, round, subtract } = require('js-big-decimal');
const utils = require('../utils');

const BAKING_REWARD_PERCENT = 5.5;
const TENTHS_2 = 2;
const TENTHS_4 = 4;
const TENTHS_8 = 8;
const TENTHS_6 = 6;
const PERCENT_EXP = 10 ** 2;
const TZBTC_EXP = 10 ** 8;
const XTZ_EXP = 10 ** 6;

const tzbtcContractAddress = 'KT1WL6sHt8syFT2ts7NCmb5gPcS2tyfRxSyi';
const xtzContractAddress = 'KT19qWdPBRtkWrsQnDvVfsqJgJB19keBhhMX';
const chain = utils.formatChain('Tezos');

const calcTotalSupply = (deposit, depositIndex, rate, EXP, TENTHS) => {
  const totalSupply = parseFloat(
    divide(multiply(deposit, depositIndex), EXP, TENTHS)
  );

  const totalSupplyUSD = parseFloat(
    round(multiply(totalSupply, rate), TENTHS_2)
  );

  return { totalSupply, totalSupplyUSD };
};

const calcTotalBorrow = (grossCredit, grossCreditIndex, rate, EXP, TENTHS) => {
  const totalBorrow = parseFloat(
    divide(multiply(grossCredit, grossCreditIndex), EXP, TENTHS)
  );
  const totalBorrowUSD = parseFloat(
    round(multiply(totalBorrow, rate), TENTHS_2)
  );
  return { totalBorrow, totalBorrowUSD };
};

const calcUtilization = (totalBorrow, totalSupply) => {
  const utilization =
    totalBorrow === 0
      ? 0
      : parseFloat(
          multiply(divide(totalBorrow, totalSupply, TENTHS_4), PERCENT_EXP)
        );
  if (utilization > 100) {
    return 100;
  }
  return utilization;
};

const calcXtzBakingRewards = (utilization) =>
  parseFloat(
    round(
      multiply(
        BAKING_REWARD_PERCENT,
        subtract(1, divide(utilization, PERCENT_EXP, TENTHS_4))
      ),
      TENTHS_2
    )
  );

const calcXtzRate = (bakingRewards, savingsRate) =>
  parseFloat(round(add(bakingRewards, savingsRate), TENTHS_2));

function getTzbtcLendPool(data) {
  const { totalSupplyUSD } = calcTotalSupply(
    data['contractInfo'][0]['tzbtcDeposit'],
    data['contractInfo'][0]['tzbtcDepositIndex'],
    data['externalInfo'][0]['tzbtcRate'],
    TZBTC_EXP,
    TENTHS_8
  );

  const { totalBorrowUSD } = calcTotalBorrow(
    data['contractInfo'][0]['tzbtcGrossCredit'],
    data['contractInfo'][0]['tzbtcGrossCreditIndex'],
    data['externalInfo'][0]['tzbtcRate'],
    TZBTC_EXP,
    TENTHS_8
  );

  const tvlUsd = parseFloat(
    round(subtract(totalSupplyUSD, totalBorrowUSD), TENTHS_2)
  );
  const apyBase = parseFloat(
    round(data['contractInfo'][0]['tzbtcDepositRate'], TENTHS_2)
  );

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
    TENTHS_6
  );

  const { totalBorrow, totalBorrowUSD } = calcTotalBorrow(
    data['contractInfo'][0]['xtzGrossCredit'],
    data['contractInfo'][0]['xtzGrossCreditIndex'],
    data['externalInfo'][0]['xtzRate'],
    XTZ_EXP,
    TENTHS_6
  );

  const tvlUsd = parseFloat(
    round(subtract(totalSupplyUSD, totalBorrowUSD), TENTHS_2)
  );

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
