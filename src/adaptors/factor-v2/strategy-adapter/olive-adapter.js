const { getAprFromDefillamaPool } = require('./utils');
const { apy } = require('../../beefy');

async function getOliveApr() {
    const beefyApr = await getAprFromDefillamaPool(
        apy,
        '0x9dbbbaecacedf53d5caa295b8293c1def2055adc'
    );

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

