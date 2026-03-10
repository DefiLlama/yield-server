const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'satsuma';
const CHAIN = 'citrea';
const SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cmamb6kkls0v2010932jjhxj4/subgraphs/analytics-mainnet/v1.0.1/gn';

// Current snapshot: TVL + cumulative fees for APY calculation
const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedUSD
      feesUSD
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
    }
  }
`;

// Prior snapshots: only cumulative fees needed to compute the delta
const queryPrior = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      feesUSD
    }
  }
`;

const apy = async (timestamp = null) => {
  // Get block numbers: current, 24h ago, 7d ago
  const [block, blockPrior24h] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH]);
  const [, blockPrior7d] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH], 604800);

  const [dataNow, dataPrior24h, dataPrior7d] = await Promise.all([
    request(SUBGRAPH, query.replace('<PLACEHOLDER>', block)),
    request(SUBGRAPH, queryPrior.replace('<PLACEHOLDER>', blockPrior24h)),
    request(SUBGRAPH, queryPrior.replace('<PLACEHOLDER>', blockPrior7d)),
  ]);

  const prior24hMap = Object.fromEntries(
    dataPrior24h.pools.map((p) => [p.id, Number(p.feesUSD)])
  );
  const prior7dMap = Object.fromEntries(
    dataPrior7d.pools.map((p) => [p.id, Number(p.feesUSD)])
  );

  const result = dataNow.pools
    .map((pool) => {
      const tvlUsd = Number(pool.totalValueLockedUSD);
      const feesNow = Number(pool.feesUSD);

      const fees24h = feesNow - (prior24hMap[pool.id] ?? feesNow);
      const fees7d = feesNow - (prior7dMap[pool.id] ?? feesNow);

      const apyBase = tvlUsd > 0 ? (fees24h / tvlUsd) * 365 * 100 : 0;
      const apyBase7d =
        tvlUsd > 0 ? ((fees7d / 7) / tvlUsd) * 365 * 100 : 0;

      return {
        pool: `${pool.id}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(
          `${pool.token0.symbol}-${pool.token1.symbol}`
        ),
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [pool.token0.id, pool.token1.id],
        url: `https://www.satsuma.exchange/liquidity/${pool.id}`,
      };
    })
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(
    result,
    'satsuma',
    (pool) => pool.pool.split(`-${CHAIN}`)[0]
  );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.satsuma.exchange/pools',
};
