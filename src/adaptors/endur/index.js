const utils = require('../utils')

const apy = async () => {
    const apyData = await utils.getData(
        'https://testnet.endur.fi/api/stats'
    );
    const symbolToToken = {
        "STRK": "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
    }
    const tvl = apyData.tvl;
    const pool = "xSTRK Pool";
    const underlyingToken = symbolToToken[apyData.asset];
    const apy = apyData.apy;
    const poolId = "1";
    return{
        pool: poolId,
        chain: 'Starknet',
        project: 'endur',
        symbol: 'STRK',
        underlyingtokens: [underlyingToken],
        tvlUsd: parseFloat(tvl),
        apy: parseFloat(apy),
        url: 'https://app.endur.fi',
        poolMeta: pool
    };
};

module.exports = {
    timetravel: false,
    apy: apy,
    url : 'https://app.endur.fi'
};