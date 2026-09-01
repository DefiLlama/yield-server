const { getDefiLLamaPools } = require('./utils');

async function getTenderApr(poolAddress) {
    const poolAddressToIdMap = {
        // USDC
        '0x068485a0f964b4c3d395059a19a05a8741c48b4e':
            'f152ff88-dd31-4efb-a0a9-ad26b5536cc7',
    };

    const pool = await getDefiLLamaPools(
        poolAddressToIdMap[poolAddress.toLowerCase()]
    );

    const apr = pool.apyBase + (isNaN(pool.apyReward) ? 0 : pool.apyReward);

    return apr;
}

module.exports = { getTenderApr };
