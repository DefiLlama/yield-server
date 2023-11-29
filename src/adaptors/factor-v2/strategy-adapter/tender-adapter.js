const { getAprFromDefillamaPool } = require('./utils');
const { apy } = require('../../tender-finance');

async function getTenderApr(underlyingTokenAddress) {
    const apr = await getAprFromDefillamaPool(
        apy,
        underlyingTokenAddress
    );

    return apr;
}

module.exports = { getTenderApr };
