const { default: BigNumber } = require('bignumber.js');

const ONE = new BigNumber(10).pow(18);

function calculateInterestRate(params, ur) {
  if (ur < 0) {
    throw new Error('utilization ratio must be positive value.');
  }

  let ir = new BigNumber(params.baseRate);

  try {
    if (ur.lte(params.kinkRate)) {
      ir = ir.plus(ur.times(params.slope1).div(ONE));
    } else {
      ir = ir.plus(params.kinkRate.times(params.slope1).div(ONE));
      ir = ir.plus(params.slope2.times(ur.minus(params.kinkRate)).div(ONE));
    }
  } catch (err) {
    console.log(err);
    return ir;
  }

  return ir;
}

module.exports = {
  calculateInterestRate,
};
