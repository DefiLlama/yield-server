const utils = require('../utils');

const bscPools = {
    elipsisARTHBUSD: "0x21dE718BCB36F649E1A7a7874692b530Aa6f986d",
    dotdotARTHBUSD: "0x21dE718BCB36F649E1A7a7874692b530Aa6f986d",
    arthMahadao: "0x2c360b513AE52947EEb37cfAD57ac9B7c9373e1B"
}

const pools = []

const getAypData = async (pool) => {
    const apyData = await utils.getData(
        'https://api.arthcoin.com/apy/guageV3Apy'
    );
    const poolData = apyData[pool]
    return poolData
}

const elipsisARTHBUSDPool = async (pools) => {
    const apy = await getAypData("ellipsis-0x21dE718BCB36F649E1A7a7874692b530Aa6f986d")
    const tvlData = await utils.getData(
        'https://api.ellipsis.finance/api/getAPRs'
    );
    const ellipsisData = tvlData.data['9']
    pools.push({
        pool: '0x21dE718BCB36F649E1A7a7874692b530Aa6f986',
        chain: utils.formatChain('bsc'),
        project: 'mahadao',
        symbol: utils.formatSymbol('busd-arth'),
        tvlUsd: Number(ellipsisData.tvl),
        apy: Number(apy.max)
    })
}

const dotdotARTHBUSDPool = async (pools) => {
    const apy = await getAypData("dot-0x21dE718BCB36F649E1A7a7874692b530Aa6f986d")
    const tvlData = await utils.getData(
        'https://api.dotdot.finance/api/lpDetails'
    );
    const dotData = tvlData.data.tokens[34]
    pools.push({
        pool: '0x21dE718BCB36F649E1A7a7874692b530Aa6f986s',
        chain: utils.formatChain('bsc'),
        project: 'mahadao',
        symbol: utils.formatSymbol('busd-arth'),
        tvlUsd: Number(dotData.epsTvlUSD),
        apy: Number(apy.max)
    })
}

const stabilityEthPool = async (pools) => {
    const tvlData = await utils.getData(
        'https://api.arthcoin.com/apy/stability'
    );
    pools.push({
        pool: '0x2c360b513AE52947EEb37cfAD57ac9B7c9373e1B',
        chain: utils.formatChain('eth'),
        project: 'mahadao',
        symbol: utils.formatSymbol('arth'),
        tvlUsd: Number(tvlData.eth.tvl),
        apy: Number(tvlData.eth.apr)
    })
}

const poolsFunction = async () => {
    await elipsisARTHBUSDPool(pools)
    await dotdotARTHBUSDPool(pools)
    await stabilityEthPool(pools)

    return pools;
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://arth.mahadao.com/#/farming',
};