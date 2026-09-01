const { getDefiLLamaPools } = require('./utils');

/*//////////////////////////////////////////////////////////////////////////////
                                     GLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getGlpApr() {
    const pool = await getDefiLLamaPools(
        '825688c0-c694-4a6b-8497-177e425b7348'
    );
    const apr = pool.apyBase + pool.apyReward;

    return apr;
}

module.exports = { getGlpApr };
