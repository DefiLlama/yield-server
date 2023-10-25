const { apy } = require('../vela-exchange');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getVlpApr() {
  const velaPools = await apy();
  const vlp = velaPools.filter(
    ({ pool, chain }) =>
      pool == '0xc4abade3a15064f9e3596943c699032748b13352-arbitrum'
  );

  if (!vlp.length) return 0;

  const apr = vlp[0].apyBase + vlp[0].apyReward;

  return apr;
}

module.exports = { getVlpApr };
