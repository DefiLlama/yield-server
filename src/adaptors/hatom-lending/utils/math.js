const BigNumber = require('bignumber.js');

const calcMarketAPY = (marketRate) => {
   const SECONDS_PER_DAY = new BigNumber(24 * 3600);
   const DAYS_PER_YEAR = new BigNumber(365);
   const calc1 = new BigNumber(marketRate)
      .multipliedBy(SECONDS_PER_DAY)
      .dividedBy(1e18)
      .toString();
   const calc2 = new BigNumber(calc1).plus(new BigNumber(1));
   const calc3 = calc2.exponentiatedBy(DAYS_PER_YEAR).toString();
   const calc4 = new BigNumber(calc3).minus(1);
   const marketAPY = new BigNumber(calc4).multipliedBy(100);

   const decimalPlaces = marketAPY.decimalPlaces();

   return marketAPY.toFixed(
      decimalPlaces > 5 ? 5 : decimalPlaces,
      BigNumber.ROUND_FLOOR
   );
}

const getRewardTokenAPY = (
   distributedDollarAmountPerDay,
   totalInUSD
) => {
   if (totalInUSD === '0') {
      return '0';
   }
   return new BigNumber(distributedDollarAmountPerDay)
      .dividedBy(totalInUSD)
      .multipliedBy(36500)
      .toString();
};

const getTotalBoosterAPY = ({
   speed,
   hTokenExchangeRate,
   totalCollateral,
   marketPrice,
   rewardsToken,
   marketDecimals,
}) => {
   const DAYS_PER_YEAR = new BigNumber(365);
   const secondsInAYear = new BigNumber(SECONDS_PER_DAY).multipliedBy(
      DAYS_PER_YEAR,
   );

   const sp = new BigNumber(speed).toFullDecimals(18 + rewardsToken?.decimals);

   const calc1 = sp
      .multipliedBy(rewardsToken?.price)
      .multipliedBy(secondsInAYear);

   const calc2 = new BigNumber(totalCollateral)
      .toUnderlying(hTokenExchangeRate)
      .toFullDecimals(marketDecimals)
      .multipliedBy(marketPrice);

   if (calc2.isEqualTo(0)) {
      return '0';
   }

   const result = calc1.dividedBy(calc2).multipliedBy(100);

   return result.isNaN() ? '0' : result.toString();
};

module.exports = {
   calcMarketAPY,
   getRewardTokenAPY,
   getTotalBoosterAPY,
};