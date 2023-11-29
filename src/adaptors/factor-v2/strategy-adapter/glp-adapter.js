const { apy } = require('../../gmx-v1');
const { getAprFromDefillamaPool } = require('./utils');

/*//////////////////////////////////////////////////////////////////////////////
                                     GLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getGlpApr() {
  const apr = await getAprFromDefillamaPool(
    apy,
    '0x1aDDD80E6039594eE970E5872D247bf0414C8903'
  );

  return apr;
}

module.exports = { getGlpApr };
