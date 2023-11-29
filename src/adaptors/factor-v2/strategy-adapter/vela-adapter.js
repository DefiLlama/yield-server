const { apy } = require('../../vela-exchange');
const { getAprFromDefillamaPool } = require('../shared');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getVlpApr() {
  const apr = await getAprFromDefillamaPool(
    apy,
    '0xc4abade3a15064f9e3596943c699032748b13352-arbitrum'
  );

  return apr;
}

module.exports = { getVlpApr };
