const { apy } = require('../../pendle');
const { getAprFromDefillamaPool } = require('./utils');

async function getPendleApr(poolId) {
  const apr = await getAprFromDefillamaPool(apy, poolId);

  return apr;
}

module.exports = { getPendleApr };
