const { request, gql } = require('graphql-request');

const GRAPHQL_URL = 'https://data.staging.arkiver.net/robolabs/reservoir-mainnet-v2/graphql';

const graphQuery = gql`
    query GetStats {
        PairSnapshots {
            swapApr
            managedApy
            pair {
                address
                token0
                token1
                token0Symbol
                token1Symbol
                tvlUSD
            }
        }
    }
`;

const getApy = async () => {
    const { PairSnapshots } = await request(GRAPHQL_URL, graphQuery);

    return PairSnapshots.map((snapshot) => ({
        pool: snapshot.pair.address,
        chain: 'Avalanche',
        project: 'reservoir',
        symbol: snapshot.pair.token0Symbol + '-' + snapshot.pair.token1Symbol,
        tvlUsd: snapshot.pair.tvlUSD,
        apyBase: snapshot.swapApr + snapshot.managedApr,
        apyReward: 0,
        rewardTokens: [], // we do not have incentive tokens at this point
        underlyingTokens: [snapshot.pair.token0, snapshot.pair.token1],
        poolMeta: '' + 'Stable ' + 'Pair'
    }))
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://analytics.reservoir.fi/',
};
