const { gql, request } = require('graphql-request');
const utils = require('../utils');

const query = gql`
  query GetPools($chain: GqlChain!, $version: Int!) {
    poolGetPools(
      first: 1000
      where: { chainIn: [$chain], protocolVersionIn: [$version], minTvl: 10000 }
    ) {
      id
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
      'https://backend-v3.beets-ftm-node.com/graphql',
      query,
      { chain: backendChain, version: version }
    );

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

      const baseApr = aprItems
        .filter(
          (item) => item.type === 'SWAP_FEE_24H' || item.type === 'IB_YIELD'
        )
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const stakingApr = aprItems
        .filter(
          (item) =>
            item.type === 'STAKING' ||
            item.type === 'MABEETS_EMISSIONS' ||
            item.type === 'STAKING_BOOST'
        )
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const rewardTokens = aprItems
        .filter(
          (item) =>
            (item.type === 'STAKING' ||
              item.type === 'MABEETS_EMISSIONS' ||
              item.type === 'STAKING_BOOST') &&
            item.rewardTokenAddress
        )
        .map((item) => item.rewardTokenAddress);

      const underlyingTokens = pool.poolTokens
        .map((token) => token.address)
        .filter(Boolean);

      return {
        pool: pool.address,
        chain: utils.formatChain(chainString),
        project: version === 3 ? 'beets-dex-v3' : 'beets-dex',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        apyReward: stakingApr * 100,
        rewardTokens: rewardTokens,
        underlyingTokens: underlyingTokens,
        url: `https://beets.fi/pools/${chainString}/v${version}/${pool.id}`,
      };
    });
  } catch (error) {
    console.error(
      `Error fetching Beets V${version} pools for ${chainString}:`,
      error
    );
    return [];
  }
};

module.exports = { getPools };
