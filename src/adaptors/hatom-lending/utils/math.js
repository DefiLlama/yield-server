const BigNumber = require('bignumber.js');

const calcRewardsAPY = ({
   speed,
   hTokenExchangeRate,
   totalCollateral,
   marketPrice,
   rewardsToken,
   rewardsTokenPrice,
   marketDecimals,
}) => {
   const SECONDS_PER_DAY = new BigNumber(86400);
   const DAYS_PER_YEAR = new BigNumber(365);
   const secondsInAYear = new BigNumber(SECONDS_PER_DAY).multipliedBy(
      DAYS_PER_YEAR,
   );

   const sp = new BigNumber(speed).dividedBy(`1e${18 + rewardsToken?.decimals}`);

   const calc1 = sp
      .multipliedBy(rewardsTokenPrice)
      .multipliedBy(secondsInAYear);

   const calc2 = new BigNumber(totalCollateral)
      .multipliedBy(hTokenExchangeRate)
      .dividedBy(`1e18`)
      .dividedBy(`1e${marketDecimals}`)
      .multipliedBy(marketPrice);

   if (calc2.isEqualTo(0)) {
      return '0';
   }

   const result = calc1.dividedBy(calc2).multipliedBy(100);

   return result.isNaN() ? '0' : result.toString();
};

const calcSimulateExchangeRate = ({
   cash,
   borrows,
   reserves,
   totalSupply,
   rate,
   timestamp,
}) => {
   return new BigNumber(
      calcExchangeRate({ cash, borrows, reserves, totalSupply }),
   )
      .multipliedBy(calcRateSimulate(rate, timestamp))
      .toString();
};

const calcRateSimulate = (rate, timestamp) => {
   const currentDate = new Date();
   const currentDateInSeconds = currentDate.getTime() / 1000;
   const timestampInSeconds = new Date(timestamp).getTime() / 1000;

   return new BigNumber(rate)
      .multipliedBy(currentDateInSeconds - timestampInSeconds)
      .dividedBy(`1e18`)
      .plus(1)
      .toString();
};

const calcExchangeRate = ({ cash, borrows, reserves, totalSupply }) => {
   const value = new BigNumber(cash)
      .plus(borrows)
      .minus(reserves)
      .times(1e18)
      .div(totalSupply)
      .toFixed(0);

   return new BigNumber(value).isNaN() ? '0' : value;
};

const calcLiquidStakingExchangeRate = (cashReserve, totalShares) => {
   if (totalShares === '0') {
      return INITIAL_EXCHANGE_RATE;
   }

   return new BigNumber(cashReserve)
      .multipliedBy('1e18')
      .dividedBy(totalShares)
      .toFixed(0, BigNumber.ROUND_DOWN);
};

module.exports = {
   calcRewardsAPY,
   calcLiquidStakingExchangeRate,
   calcSimulateExchangeRate,
};