const utils = require('../utils');
const { request, gql } = require('graphql-request');

const API_URL = 'https://backend.swop.fi/pools';
const UNIT0_GRAPH_URL = 'http://graphql-node-htz-fsn1-1.wvservices.com:8000/subgraphs/name/swopfi/swopfi-units'

const queryUnit0 = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveUNIT0, orderDirection: desc block: {number: <PLACEHOLDER>}, where: {reserve1_gt: "0.0000001", reserve0_gt: "0.0000001"}) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPriorUnit0 = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveUNIT0 orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const getWavesPools = async () => {
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
}

const getUnit0Pools = async (timestamp = null) => {
    chainString = 'unit0'
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
        UNIT0_GRAPH_URL,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
        chainString,
        timestamp,
        [UNIT0_GRAPH_URL],
        604800
    );
    // pull data
    let queryC = queryUnit0;
    let dataNow = await request(UNIT0_GRAPH_URL, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pairs;


    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPriorUnit0;
    let dataPrior = await request(
        UNIT0_GRAPH_URL,
        queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pairs;

    // 7d offset
    const dataPrior7d = (
        await request(UNIT0_GRAPH_URL, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    ).pairs;

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);
    // calculate apy
    dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v2'));

    return dataNow.map((p) => {
        const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
        const underlyingTokens = [p.token0.id, p.token1.id];
        const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
        const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
        const url = `https://units.swop.fi/#/add/${token0}/${token1}`;

        return {
            pool: p.id,
            chain: utils.formatChain(chainString),
            project: 'swop',
            symbol,
            tvlUsd: p.totalValueLockedUSD,
            apyBase: p.apy1d,
            apyBase7d: p.apy7d,
            underlyingTokens,
            url,
            volumeUsd1d: p.volumeUSD1d,
            volumeUsd7d: p.volumeUSD7d,
        };
    });
}

const main = async (timestamp = null) => {
    const data = [];
    data.push(...await getWavesPools()); // get pools from waves chain
    data.push(...await getUnit0Pools(timestamp)); // get pools from waves chain
    return data.filter((p) => utils.keepFinite(p));
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://swop.fi/',
};
