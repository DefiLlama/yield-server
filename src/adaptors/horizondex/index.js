const { request, gql } = require('graphql-request');

const utils = require('../utils');
const axios = require("axios");

CHAINS_API = {
    linea: 'https://subgraph-mainnet.horizondex.io/subgraphs/name/horizondex/horizondex-mainnet-v2',
    base: 'https://subgraph-base.horizondex.io/subgraphs/name/horizondex/horizondex-base'
};

BLOCKS_API = {
    linea: 'https://subgraph-mainnet.horizondex.io/subgraphs/name/horizondex/blocks',
    base: 'https://subgraph-base.horizondex.io/subgraphs/name/horizondex/blocks'
}

const farmsApi = 'https://api.horizondex.io/farms/<CHAIN>'

const query = gql`
    {
        pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
            id
            volumeUSD
            feeTier
            token0 {
                symbol
                id
            }
            token1 {
                symbol
                id
            }
            totalValueLockedToken0
            totalValueLockedToken1
        }
    }
`;

const queryPrior = gql`
    {
        pools (first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
            id
            volumeUSD
        }
    }
`;

const topLvl = async (chainString, url, timestamp) => {
    try {
        const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
            BLOCKS_API[chainString],
        ]);

        let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pools;

        const dataPrior = (
            await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
        ).pools;

        data = data.map((p) => ({
            ...p,
            reserve0: p.totalValueLockedToken0,
            reserve1: p.totalValueLockedToken1,
            feeTier: p.feeTier * 10,
        }));
        data = await utils.tvl(data, chainString);

        data = data.map((p) => utils.apy(p, dataPrior, []));
        const farmData = (await axios.get(farmsApi.replace('<CHAIN>', chainString))).data;

        return data.map((p) => {
            const symbol = utils.formatSymbol(
                `${p.token0.symbol}-${p.token1.symbol}`
            );
            const farm = farmData
                .filter((farmInfo) => farmInfo.pool_id.toLowerCase() === p.id.toLowerCase())
                .sort((a, b) => b.pid - a.pid)[0];

            const apyReward = farm?.apr
            return {
                pool: p.id,
                chain: utils.formatChain(chainString),
                project: 'horizondex',
                symbol,
                tvlUsd: p.totalValueLockedUSD,
                apyBase: p.apy1d,
                apyReward: apyReward || 0,
                rewardTokens: apyReward > 0 ? farm.reward_tokens.map((r) => r.address) : [],
                underlyingTokens: [p.token0.id, p.token1.id],
                poolMeta: `${p.feeTier / 1e4}%`,
                volumeUsd1d: p.volumeUSD1d,
            };
        });
    } catch (e) {
        if (e.message.includes('Stale subgraph')) return [];
        else throw e;
    }
};

const main = async (timestamp = null) => {
    const data = await Promise.all(
        Object.entries(CHAINS_API).map(([chain, url]) =>
            topLvl(chain, url, timestamp)
        )
    );

    return data.flat()
};

module.exports = {
    apy: main,
    timetravel: false,
    url: 'https://app.horizondex.io/pools',
};
