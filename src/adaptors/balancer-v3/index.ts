const { gql, request } = require('graphql-request');
const utils = require('../utils');

const query = gql`
  query GetPools($chain: GqlChain!, $version: Int!) {
    poolGetPools(
      first: 1000
      where: { chainIn: [$chain], protocolVersionIn: [$version] }
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

const getPools = async (backendChain, chainString, version) => {
  try {
    const { poolGetPools } = await request(
      'https://api-v3.balancer.fi/graphql',
      query,
      { chain: backendChain, version: version }
    );

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

      const baseApr = aprItems
        .filter(
          (item) =>
            item.type === 'IB_YIELD' ||
            item.type === 'SWAP_FEE_24H'
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

      const chainUrl = chainString === 'xdai' ? 'gnosis' : chainString;

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
    getPools('MAINNET', 'ethereum', 3),
    getPools('GNOSIS', 'xdai', 3),
    getPools('ARBITRUM', 'arbitrum', 3),
    getPools('OPTIMISM', 'optimism', 3),
    getPools('AVALANCHE', 'avax', 3),
    getPools('BASE', 'base', 3),
    getPools('HYPEREVM', 'hyperliquid', 3),
    getPools('PLASMA', 'plasma', 3),
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
