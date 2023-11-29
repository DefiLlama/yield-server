async function getAprFromDefillamaPool(apyFunction, poolId) {
    const pools = await apyFunction();
    const pool = pools.filter(
        (item) => item.pool.toLowerCase() == poolId.toLowerCase()
    );

    if (!pool.length) return 0;

    const apr = pool[0].apyBase + pool[0].apyReward;

    return apr;
}

function makeReadable(val, dec = 18) {
    return parseInt(val) / 10 ** dec;
}

module.exports = {makeReadable, getAprFromDefillamaPool };
