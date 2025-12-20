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

const getV3Pools = async (backendChain, chainString) => {
  try {
    const { poolGetPools } = await request(
      'https://api-v3.balancer.fi/graphql',
      query,
      { chain: backendChain }
    );

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

      const baseApr = aprItems
        .filter(
          (item) => item.type === 'IB_YIELD' || item.type === 'SWAP_FEE_24H'
        )
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

      const chainUrl =
        chainString === 'xdai'
          ? 'gnosis'
          : chainString === 'avax'
          ? 'avalanche'
          : chainString;

      return {
        pool: pool.address,
        chain: utils.formatChain(chainString),
        project: 'balancer-v3',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        apyReward: stakingApr * 100,
        rewardTokens: rewardTokens,
        underlyingTokens: underlyingTokens,
        url: `https://balancer.fi/pools/${chainUrl}/v3/${pool.address}`,
      };
    });
  } catch (error) {
    console.error(
      `Error fetching Balancer V3 pools for ${chainString}:`,
      error
    );
    return [];
  }
};

const poolsFunction = async () => {
  const [
    mainnetPools,
    gnosisPools,
    arbitrumPools,
    optimismPools,
    avalanchePools,
    basePools,
    hyperliquidPools,
    plasmaPools,
  ] = await Promise.all([
    getV3Pools('MAINNET', 'ethereum'),
    getV3Pools('GNOSIS', 'xdai'),
    getV3Pools('ARBITRUM', 'arbitrum'),
    getV3Pools('OPTIMISM', 'optimism'),
    getV3Pools('AVALANCHE', 'avax'),
    getV3Pools('BASE', 'base'),
    getV3Pools('HYPEREVM', 'hyperliquid'),
    getV3Pools('PLASMA', 'plasma'),
  ]);

  return [
    ...mainnetPools,
    ...gnosisPools,
    ...arbitrumPools,
    ...optimismPools,
    ...avalanchePools,
    ...basePools,
    ...hyperliquidPools,
    ...plasmaPools,
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://balancer.fi/pools',
};
