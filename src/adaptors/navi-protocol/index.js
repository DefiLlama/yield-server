const axios = require('axios');

const poolsFunction = async () => {
    let pools = await axios.get('https://api-defi.naviprotocol.io/getIndexAssetData');

    const arr = [];
    Object.entries(pools.data).forEach(([key, val]) => {
        arr.push({
            chain: 'Sui',
            project: 'navi-protocol',
            pool: val.pool, // `${ReceivedTokenAddress}-${chain}`
            symbol: val.symbol, // symbol of the tokens in pool
            tvlUsd: parseFloat(val.total_supply) * parseFloat(val.price),
            apyBase: parseFloat(val.supply_rate),
            apyReward: parseFloat(val.boosted) > 0 ? parseFloat(val.boosted) : null,
            rewardTokens: val.rewardTokens,
            poolMeta: null
        });
    })

    return arr;
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://app.naviprotocol.io/',
};
