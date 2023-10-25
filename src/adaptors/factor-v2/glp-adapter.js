const { apy } = require('../gmx-v1');

/*//////////////////////////////////////////////////////////////////////////////
                                     GLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getGlpApr() {
  const gmxPools = await apy();
  const glp = gmxPools.filter(
    ({ pool }) => pool == '0x1aDDD80E6039594eE970E5872D247bf0414C8903'
  );

  if (!glp.length) return 0;

  const apr = glp[0].apyBase;

  return apr;
}

module.exports = { getGlpApr };
