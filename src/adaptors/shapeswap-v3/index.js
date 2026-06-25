const { request, gql } = require('graphql-request');

const utils = require('../utils');

const SUBGRAPH = 'https://graph.swap.w3us.site/subgraphs/name/shape/uniswap-v3';
const CHAIN = 'shape';
const PROJECT = 'shapeswap-v3';

const poolsQuery = gql`
  query ($block: Int!) {
    pools(
      first: 1000
      orderBy: totalValueLockedUSD
      orderDirection: desc
      block: { number: $block }
      where: { totalValueLockedUSD_gt: "100" }
    ) {
      id
      feeTier
      totalValueLockedToken0
      totalValueLockedToken1
      totalValueLockedUSD
      volumeUSD
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
`;

const priorVolumeQuery = gql`
  query ($block: Int!) {
    pools(
      first: 1000
      orderBy: totalValueLockedUSD
      orderDirection: desc
      block: { number: $block }
    ) {
      id
      volumeUSD
    }
  }
`;

const apy = async (timestamp = null) => {
  const [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH]);

  const { pools } = await request(SUBGRAPH, poolsQuery, { block });

  let priorPools = [];
  try {
    priorPools = (await request(SUBGRAPH, priorVolumeQuery, { block: blockPrior })).pools;
  } catch (e) {
    console.log('shapeswap-v3 prior block query failed, falling back to zero prior volume', e.message);
  }
  const priorVolumeById = Object.fromEntries(priorPools.map((p) => [p.id, Number(p.volumeUSD)]));

  return pools
    .map((p) => {
      const tvlUsd = Number(p.totalValueLockedUSD);
      const volumeUsdAll = Number(p.volumeUSD);
      const volumeUsd1d = Math.max(volumeUsdAll - (priorVolumeById[p.id] ?? volumeUsdAll), 0);
      const feeRate = Number(p.feeTier) / 1e6;
      const fees1d = volumeUsd1d * feeRate;
      const apyBase = tvlUsd > 0 ? (fees1d * 365 * 100) / tvlUsd : 0;

      return {
        pool: `${p.id}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        tvlUsd,
        apyBase,
        underlyingTokens: [p.token0.id, p.token1.id],
        poolMeta: `${Number(p.feeTier) / 1e4}%`,
        url: `https://info.shapeswap.xyz/home#/pools/${p.id}`,
        volumeUsd1d,
      };
    })
    .filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://shapeswap.xyz/',
};
