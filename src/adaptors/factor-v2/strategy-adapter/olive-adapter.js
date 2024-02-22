const { getDefiLLamaPools } = require('./utils');

async function getOliveApr() {
    const pool = await getDefiLLamaPools(
        '79587734-a461-4f4c-b9e2-c85c70484cf8'
    );

    const beefyApr =
        pool.apyBase + (isNaN(pool.apyReward) ? 0 : pool.apyReward);

    const ampFactor = 1.33;
    const weeksPerYear = 365 / 7;
    const oliveBoost = 0.05;
    const apr =
        (1 + (beefyApr * ampFactor) / weeksPerYear) ** weeksPerYear -
        1 +
        oliveBoost;

    return apr * 100;
}

module.exports = { getOliveApr };
