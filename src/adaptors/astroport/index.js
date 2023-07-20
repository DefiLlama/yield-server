const { request } = require('graphql-request');

const API_ENDPOINT = "https://multichain-api.astroport.fi/graphql";

const yieldQuery = `
  query Pools($chains: [String]!, $limit: Int, $sortField: PoolSortFields, $sortDirection: SortDirections) {
    pools(chains: $chains, limit: $limit, sortField: $sortField, sortDirection: $sortDirection) {
      chainId
      poolAddress
      poolLiquidityUsd
      poolType
      tradingFees {
        apr
        apy
      }
      token0Address
      token1Address
      rewardTokenSymbol
      protocolRewards {
        apr
        apy
      }
      astroRewards {
        apr
        apy
      }
    }
  }
`;

const chainIdToNames = {
  "phoenix-1": "Terra2",
  "injective-1": "Injective",
  "neutron-1": "Neutron"
}

const astroDenoms = {
  "phoenix-1": "terra1nsuqsk6kh58ulczatwev87ttq2z6r3pusulg9r24mfj2fvtzd4uq3exn26",
  "injective-1": "ibc/EBD5A24C554198EBAF44979C5B4D2C2D312E6EBAB71962C92F735499C7575839",
  "neutron-1": "ibc/5751B8BCDA688FD0A8EC0B292EEF1CDEAB4B766B63EC632778B196D317C40C3A"
}

const getSymbol = (tokens) => {
  let result = '';
  for (const token of tokens) {
    if (token != null) {
      result += token.split('-')[0] + '-';
    }
  }
  return result.slice(0, -1);
};

const getTokens = (tokens) => {
  let result = [];
  for (const token of tokens) {
    if (token != null) {
      result.push(token);
    }
  }
  return result;
};

const getRewardTokens = (pool) => {
  const rewardTokens = [];
  if (pool?.protocolRewards?.apr > 0) {
    rewardTokens.push(pool?.rewardTokenSymbol);
  }
  if (pool?.astroRewards?.apr > 0) {
    rewardTokens.push(astroDenoms[pool.chainId]);
  }
  return rewardTokens.length > 0 ? rewardTokens : undefined;
}

const apy = async () => {

  let results = await request(API_ENDPOINT, yieldQuery, {
    "chains": ["phoenix-1", "injective-1", "neutron-1"],
    "limit": 100,
    "sortField": "TVL",
    "sortDirection": "DESC"
  });

  const apy = results?.pools?.filter(pool => pool?.poolLiquidityUsd && pool?.poolLiquidityUsd > 10000).map((pool) => {
    const apyBase = pool?.tradingFees?.apy ? pool?.tradingFees?.apy * 100 : 0;
    const chain = chainIdToNames[pool.chainId];
    const astroRewards = pool?.astroRewards?.apr || 0;
    const protocolRewards = pool?.protocolRewards?.apr || 0;
    const apyReward = (astroRewards + protocolRewards) * 100;

    return {
      pool: `${pool.poolAddress}-${chain}`.toLowerCase(),
      project: 'astroport',
      chain,
      symbol: `${pool.token0Address}-${pool.token1Address}`,
      tvlUsd: pool.poolLiquidityUsd || 0,
      apyBase,
      apyReward,
      rewardTokens: getRewardTokens(pool),
      underlyingTokens: [pool.token0Address, pool.token1Address],
      url: `https://app.astroport.fi/pools/${pool.poolAddress}/provide`
    }
  });

  return apy;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.ashswap.io/pool/',
};
