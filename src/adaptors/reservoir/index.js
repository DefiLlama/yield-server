const { request, gql } = require('graphql-request');

const GRAPHQL_URL = 'https://data.staging.arkiver.net/robolabs/reservoir-mainnet-v2/graphql';

const graphQuery = gql`
    query GetStats {
        PairSnapshots {
            swapApr
            managedApy
            pair {
                address
                curveId
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

    return PairSnapshots.map((snapshot) => {
        const symbols = snapshot.pair.token0Symbol + '-' + snapshot.pair.token1Symbol
        const poolType = snapshot.pair.curveId === 0 ? 'Constant Product' : 'Stable'
        return {
            pool: snapshot.pair.address,
            chain: 'Avalanche',
            project: 'reservoir',
            symbol: symbols,
            tvlUsd: snapshot.pair.tvlUSD,
            apyBase: (snapshot.swapApr + snapshot.managedApy) * 100, // to convert into percentage form
            apyReward: 0,
            rewardTokens: [], // we do not have incentive tokens at this point
            underlyingTokens: [snapshot.pair.token0, snapshot.pair.token1],
            poolMeta: poolType
        }
    })
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://analytics.reservoir.fi/',
};
