const { gql, request } = require('graphql-request');
const utils = require('../utils');

const query = gql`
  query GetPools($chain: GqlChain!) {
    poolGetPools(
      first: 1000
      where: { chainIn: [$chain], protocolVersionIn: [3] }
    ) {
      chain
      symbol
      address
      poolTokens {
        address
        symbol
      }
      dynamicData {
        totalLiquidity
        aprItems {
          type
          apr
          rewardTokenAddress
        }
      }
    }
  }
`;

const getV3Pools = async (apiChain, frontendChain, llamaChain) => {
  try {
    const { poolGetPools } = await request(
      'https://api-v3.balancer.fi/graphql',
      query,
      { chain: apiChain }
    );

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

      const baseApr = aprItems
        .filter((item) => item.type === 'SWAP_FEE' || item.type === 'IB_YIELD')
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const stakingApr = aprItems
        .filter((item) => item.type === 'STAKING')
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const rewardTokens = aprItems
        .filter((item) => item.type === 'STAKING' && item.rewardTokenAddress)
        .map((item) => item.rewardTokenAddress);

      const underlyingTokens = pool.poolTokens
        .map((token) => token.address)
        .filter(Boolean);

      return {
        pool: pool.address,
        chain: utils.formatChain(llamaChain),
        project: 'balancer-v3',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        apyReward: stakingApr * 100,
        rewardTokens: rewardTokens,
        underlyingTokens: underlyingTokens,
        url: `https://balancer.fi/pools/${frontendChain}/v3/${pool.address}`,
      };
    });
  } catch (error) {
    console.error(`Error fetching Balancer V3 pools for ${llamaChain}:`, error);
    return [];
  }
};

const poolsFunction = async () => {
  const [mainnetPools, gnosisPools] = await Promise.all([
    getV3Pools('MAINNET', 'ethereum', 'ethereum'),
    getV3Pools('GNOSIS', 'gnosis', 'xdai'),
  ]);

  return [...mainnetPools, ...gnosisPools];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://balancer.fi/pools',
};
