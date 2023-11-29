const { apy } = require('../../vela-exchange');
const { getAprFromDefillamaPool } = require('./utils');
const { default: axios } = require('axios');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getVlpApr() {
    // ERROR in VLP Adapter !!

    // const apr = await getAprFromDefillamaPool(
    //   apy,
    //   '0xc4abade3a15064f9e3596943c699032748b13352-arbitrum'
    // );

    const response = await axios.get(
        'https://api.vela.exchange/graph/vlp-apr/42161'
    );
    const apr = response.data.TOTAL_APR;

    return apr;
}

module.exports = { getVlpApr };
