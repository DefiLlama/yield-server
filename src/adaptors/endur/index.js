const utils = require('../utils')
const STRK = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

const apy = async () => {
    const apyData = await utils.getData(
        'https://staging.endur.fi/api/lst/stats'
    );
    return apyData
    .filter(lst => parseFloat(lst.tvlUsd) > 10000)
    .map((lst) => {
        const currTvlUsd = parseFloat(lst.tvlUsd);
        const currPool = lst.asset;
        const baseApy = lst.apyInPercentage;
        const underlyingTokens = lst.assetAddress;

        return {
            pool: currPool, 
            chain: 'Starknet',
            project: 'endur',
            symbols: currPool,
            underlyingTokens: underlyingTokens,
            tvlUsd: currTvlUsd,
            apyBase: baseApy,
            url: `https://app.endur.fi/`,
            poolMeta: currPool,
        }
    })
};

module.exports = {
    timetravel: false,
    apy: apy,
    url : 'https://app.endur.fi'
};