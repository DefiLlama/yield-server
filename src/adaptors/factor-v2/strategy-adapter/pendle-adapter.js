const { getDefiLLamaPools } = require('./utils');

async function getPendleApr(poolAddress) {
    const poolAddressToIdMap = {
        // wstETH
        '0x08a152834de126d2ef83d612ff36e4523fd0017f':
            'f05aa688-f627-4438-89c6-2fef135510c7',

        // rETH
        '0x14fbc760efaf36781cb0eb3cb255ad976117b9bd':
            '35fe5f76-3b7d-42c8-9e54-3da70fbcb3a9',
    };

    const pool = await getDefiLLamaPools(
        poolAddressToIdMap[poolAddress.toLowerCase()]
    );

    const apr = pool.apyBase + pool.apyReward;

    return apr;
}

module.exports = { getPendleApr };
