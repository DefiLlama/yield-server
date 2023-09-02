const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const abi = require('./abi.json');

const SECONDS_PER_YEAR = BigNumber('31536000');

const USD_DECIMALS = 8;
const WEI_DECIMALS = 18;
const RAY_DECIMALS = 27;
const RAY_DECIMALS_PERCENTAGE = 29;
const LTV_PRECISION = 4;

const RAY = BigNumber(10).pow(27);
const HALF_RAY = RAY.div(2);

const chains = {
  100: 'xdai',
};

function rayMul(a, b) {
  return HALF_RAY.plus(a.multipliedBy(b)).div(RAY);
}

function calculateCompoundedInterest(
  rate,
  currentTimestamp,
  lastUpdateTimestamp
) {
  let compounded = BigNumber(0);
  const timeDelta = BigNumber(currentTimestamp - lastUpdateTimestamp);
  const ratePerSecond = BigNumber(rate).div(SECONDS_PER_YEAR);
  if (timeDelta.gt(0)) {
    const base = ratePerSecond;
    const exp = timeDelta;
    const expMinusOne = exp.minus(1);
    const expMinusTwo = exp.gt(2) ? exp.minus(2) : 0;
    const basePowerTwo = rayMul(base, base);
    const basePowerThree = rayMul(basePowerTwo, base);

    const firstTerm = exp.multipliedBy(base);
    const secondTerm = exp
      .multipliedBy(expMinusOne)
      .multipliedBy(basePowerTwo)
      .div(2);
    const thirdTerm = exp
      .multipliedBy(expMinusOne)
      .multipliedBy(expMinusTwo)
      .multipliedBy(basePowerThree)
      .div(6);

    compounded = RAY.plus(firstTerm).plus(secondTerm).plus(thirdTerm);
  }
  return compounded;
}

async function callGetReservesData() {
  let res = (
    await sdk.api.abi.call({
      abi: abi.getReservesData,
      // NOTE that target is an AAVE-based UIPoolDataProvider address
      target: '0x31d341fc1f2172a37e8fc4a6606e2f6620239feb',
      // with param being the ILendingPoolAddressesProvider for RealT
      params: ['0x0ade75f269a054673883319baa50e5e0360a775f'],
      chain: chains[100].toLowerCase(),
    })
  ).output;

  // Only WXDai is lendable
  let wxdai = res[0]['0'];

  //console.log(sdk)
  let latest_block = await sdk.api.util.getLatestBlock('xdai');

  // get compoundeds of variable/stable borrow rates
  let variableCompounded = calculateCompoundedInterest(
    wxdai.variableBorrowRate,
    latest_block.timestamp,
    wxdai.lastUpdateTimestamp
  );
  let stableCompounded = calculateCompoundedInterest(
    wxdai.averageStableRate,
    latest_block.timestamp,
    wxdai.stableDebtLastUpdateTimestamp
  );

  // Needed to calc scaled -> non-scaled variable debt
  let bigVariableBorrowIndex = BigNumber(wxdai.variableBorrowIndex);

  let totalVariableDebt = rayMul(
    BigNumber(wxdai.totalScaledVariableDebt),
    bigVariableBorrowIndex
  );
  let totalStableDebt = BigNumber(wxdai.totalPrincipalStableDebt);

  if (variableCompounded.gt(0))
    totalVariableDebt = rayMul(totalVariableDebt, variableCompounded);
  if (stableCompounded.gt(0))
    totalStableDebt = rayMul(totalStableDebt, stableCompounded);

  return [
    {
      pool: wxdai.underlyingAsset + '-realt',
      chain: utils.formatChain('xdai'),
      project: 'realt-tokens',
      symbol: wxdai.symbol,
      tvlUsd: totalVariableDebt
        .plus(totalStableDebt)
        .plus(BigNumber(wxdai.availableLiquidity))
        .times(
          BigNumber(wxdai.priceInMarketReferenceCurrency).div(
            10 ** USD_DECIMALS
          )
        )
        .div(10 ** WEI_DECIMALS)
        .toNumber(),
      apy: utils.aprToApy(
        parseFloat(
          BigNumber(wxdai.liquidityRate)
            .div(10 ** RAY_DECIMALS)
            .times(100)
        )
      ),
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: callGetReservesData,
  url: 'https://realt.co/',
};
