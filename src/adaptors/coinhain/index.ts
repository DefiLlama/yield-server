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
      'https://api.coinhain.fi/graphql',
      query,
      { chain: backendChain }
    );

    return poolGetPools
      .filter(
        (pool) =>
          pool.address.toLowerCase() !==
          '0xfd3b274a5f0316ef3499de0a207b37ff9d7eefec'
      )
      .map((pool) => {
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

      const chainUrl = chainString;

      return {
        pool: pool.address,
        chain: utils.formatChain(chainString),
        project: 'coinhain',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        apyReward: stakingApr * 100,
        rewardTokens: rewardTokens,
        underlyingTokens: underlyingTokens,
        url: `https://app.coinhain.fi/pools/${chainUrl}/v3/${pool.address}`,
      };
    });
  } catch (error) {
    console.error(
      `Error fetching Coinhain pools for ${chainString}:`,
      error
    );
    return [];
  }
};

const poolsFunction = async () => {
  const [
 bscPools
  ] = await Promise.all([
    getV3Pools('BSC', 'bsc'),
  ]);

  return [
    ...bscPools,
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://coinhain.fi/pools',
};
