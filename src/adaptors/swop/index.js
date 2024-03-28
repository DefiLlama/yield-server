const utils = require('../utils');

const API_URL = 'https://backend.swop.fi/pools';

const getApy = async () => {
    const SWOP_TOKEN_ID = "Ehie5xYpeN8op1Cctc6aGUrqx8jq3jtf1DSjXDbfm7aT";
    const CHAIN = "waves"
    const BASE_POOL_URL = "https://swop.fi/pool?address="
    const data = await utils.getData(API_URL);

    const pools = data.pools.filter((pool) => { return !pool.isDeprecated})
        .map((pool) => {
        return {
            pool: `${pool.id}-${CHAIN}`.toLowerCase(),
            chain: utils.formatChain(CHAIN),
            project: 'swop',
            symbol: pool.name.replace(' / ', '-'),
            tvlUsd: Number(pool.liquidity),
            apyBase: Number(pool.day.liquidityApy),
            apyReward: Number(pool.current.swopApr.min),
            rewardTokens: [SWOP_TOKEN_ID],
            underlyingTokens: pool.assets.map(a => a.id),
            url: `${BASE_POOL_URL}${pool.id}`
        };
    });
    return pools;
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://swop.fi/',
};
