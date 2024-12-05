const BigNumber = require('bignumber.js');

const valueToZDBigNumber = (amount) => {
  const BigNumberZeroDecimal = BigNumber.clone({
    DECIMAL_PLACES: 0,
    ROUNDING_MODE: BigNumber.ROUND_DOWN,
  });
  return new BigNumberZeroDecimal(amount);
};

const calculateAPY = (rate) => {
  const SECONDS_PER_YEAR = new BigNumber('31536000');
  const RAY = valueToZDBigNumber(10).pow(27);
  const RAY_DECIMALS = 27;
  const HALF_RAY = RAY.dividedBy(2);

  const rayPow = (a, p) => {
    let x = valueToZDBigNumber(a);
    let n = valueToZDBigNumber(p);
    let z = n.modulo(2).eq(0) ? valueToZDBigNumber(RAY) : x;

    for (n = n.div(2); !n.eq(0); n = n.div(2)) {
      x = rayMul(x, x);

      if (!n.modulo(2).eq(0)) {
        z = rayMul(z, x);
      }
    }

    return z;
  };

  const rayMul = (a, b) => {
    return HALF_RAY.plus(valueToZDBigNumber(a).multipliedBy(b)).div(RAY);
  };

  return rayPow(
    valueToZDBigNumber(rate).dividedBy(SECONDS_PER_YEAR).plus(RAY),
    SECONDS_PER_YEAR
  )
    .minus(RAY)
    .shiftedBy(-RAY_DECIMALS);
};

module.exports = {
  calculateAPY,
};
