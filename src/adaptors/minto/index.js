const utils = require('../utils');

const poolsFunction = async () => {
    const apyData = await utils.getData(
        'https://stats-dev.minto.org/v1/llama/bsc-auto-apy'
    );
    const tvlData = await utils.getData(
        'https://stats-dev.minto.org/v1/llama/bsc-auto-tvl'
    );


    const pool = {
        pool: '0xe742FCE58484FF7be7835D95E350c23CE55A7E12',
        chain: utils.formatChain('bsc'),
        project: 'minto bsc autofarm',
        symbol: utils.formatSymbol('BTCMT'),
        tvlUsd: tvlData.value,
        apy: apyData.value
    };

    return [pool]; // Anchor only has a single pool with APY
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
};