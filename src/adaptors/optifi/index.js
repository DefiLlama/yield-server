const utils = require('../utils');

const collectPools = async () => {
    const [data1, data2] = await Promise.all([
        utils.getData('https://lambda.optifi.app/get_amm_apy?optifi_program_id=optFiKjQpoQ3PvacwnFWaPUAqXCETMJSz2sz8HwPe9B&amm_id=1'),
        utils.getData('https://lambda.optifi.app/get_amm_apy?optifi_program_id=optFiKjQpoQ3PvacwnFWaPUAqXCETMJSz2sz8HwPe9B&amm_id=2'),
    ]);

    let apy = [(Object.entries(data1))[0][1]["apy_pct"], (Object.entries(data2))[0][1]["apy_pct"]];
    let tvl = [(Object.entries(data1))[0][1]["now"]["tvl"], (Object.entries(data2))[0][1]["now"]["tvl"]];

    let poolAddress = ["4UoELNjSk36m3aqTS6PnxNoUSZYXKWa7hEn7i6BRHrUu", "8J7AfECijPQDUfj7k6pQk6YNTEqjSAjiZnsGNgRZmowz"]
    return Object.entries(apy).map(([i, apy]) => ({
        pool: poolAddress[i],
        chain: utils.formatChain('solana'),
        project: 'optifi',
        symbol: utils.formatSymbol('USDC'),
        tvlUsd: tvl[i],
        apy: apy,
    })

    );
};

module.exports = {
    timetravel: false,
    apy: collectPools,
};
