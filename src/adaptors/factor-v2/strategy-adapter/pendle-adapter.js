const { apy } = require('../../pendle');
const { getAprFromDefillamaPool } = require('../shared');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getPendleApr(poolId) {
  const apr = await getAprFromDefillamaPool(apy, poolId);

  return apr;
}

module.exports = { getPendleApr };
