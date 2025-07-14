const utils = require('../utils');
const { Address } = require('@ton/core');

const GRAPHQL_ENDPOINT = 'https://indexer.tonco.io/';
const POOLS_QUERY = `
    query Pools {
    pools ( filter: { orderBy: "usd" } ) {
        address
        apr
        name
        totalValueLockedUsd
        jetton0 {
            address
        }
        jetton1 {
            address
        }
    }
    }
`;

const getApy = async () => {
    console.log("Requesting pools list")
    const poolsList = (await utils.getData(GRAPHQL_ENDPOINT, {
        query: POOLS_QUERY
    })).data.pools;

    const poolsInfo = {};
    for (const pool of poolsList.slice(0, 10)) {
        const address = pool.address;

        const tvl = pool.totalValueLockedUsd;

        poolsInfo[pool.address] = {
            symbol: pool.name.replace('wTTon', 'TON'),
            tvl: tvl,
            apyBase: pool.apr,
            underlyingTokens: [Address.parse(pool.jetton0.address).toString(), Address.parse(pool.jetton1.address).toString()]
        }
    }
    console.log(`Inited ${Object.keys(poolsInfo).length} pools`);


    const pools = Object.keys(poolsInfo)
        .map((pool_address) => {
            const pool = poolsInfo[pool_address];
            return {
                pool: `${pool_address}-ton`.toLowerCase(),
                chain: 'Ton',
                project: 'tonco',
                symbol: pool.symbol,
                tvlUsd: pool.tvl,
                apyBase: pool.apyBase,
                underlyingTokens: pool.underlyingTokens,
                url: `https://app.tonco.io/#/pool/${pool_address}`
            };
        });
    return pools;
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://tonco.io/',
};
