const utils = require('../utils')

const apy = async () => {
    const apyData = await utils.getData(
        'https://app.endur.fi/api/stats'
    );
    const symbolToToken = {
        "STRK": '0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
    }
    const tvl = apyData.tvl;
    const pool = "xSTRK Pool";
    const underlyingToken = symbolToToken[apyData.asset];
    const apy = apyData.apy * 100;
    const poolId = "endur_strk";
    return [{
        pool: poolId,
        chain: 'Starknet',
        project: 'endur',
        symbol: "STRK",
        underlyingTokens: [underlyingToken],
        tvlUsd: parseFloat(tvl),
        apy: parseFloat(apy),
        url: 'https://app.endur.fi',
        poolMeta: pool
    }];
};

module.exports = {
    timetravel: false,
    apy: apy,
    url : 'https://app.endur.fi'
};