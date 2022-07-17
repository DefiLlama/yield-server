const utils = require('../utils');

const getPools = async () => {
    const tdotApr = await utils.getData(
        'https://api.taigaprotocol.io/rewards/apr?network=acala&pool=0'
    );
    const tdotData = await utils.getData(
        'https://api.taigaprotocol.io/tokens/tdot'
    );
    const dotPrice = await utils.getData(
        'https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true'
    );

    const tdot = {
        pool: 'acala-sa://0-tapio',
        chain: 'acala',
        project: 'tapio-protocol',
        symbol: 'tDOT',
        tvlUsd: Number(tdotData.tvl) * Number(dotPrice.polkadot.usd),
        apyBase: Number(tdotApr["sa://0"]) * 100,
    };

    return [tdot];
};

module.exports = {
    timetravel: false,
    apy: getPools,
};