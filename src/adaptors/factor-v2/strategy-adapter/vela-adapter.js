const { getDefiLLamaPools } = require('./utils');

/*//////////////////////////////////////////////////////////////////////////////
                                     VLP APR                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getVlpApr() {
    const pool = await getDefiLLamaPools(
        'ddafe2fb-757a-45dd-87b5-a2c42dc9e093'
    );
    const apr = pool.apyBase + pool.apyReward;

    return apr;
}

module.exports = { getVlpApr };
