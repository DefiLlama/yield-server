


const getApr = async () => {



    const pool = {
        pool: 'address',
        chain: 'Avalanche',
        project: 'reservoir',
        symbol: 'sym1' + '-' + 'sym2',
        tvlUsd: 0,
        apyBase: 0,
        apyReward: 0,
        rewardTokens: [], // we do not have incentive tokens at this point
        underlyingTokens: [],
        poolMeta: '' + 'Stable ' + 'Pair'

    }
    return pool;
}

module.exports = {
    timetravel: false,
    apy: getApr,
    url: 'https://analytics.reservoir.fi/',
};
