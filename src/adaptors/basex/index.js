const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const api = 'https://api-backend-0191c757fded.herokuapp.com/graphql';

const query = gql`
  {
    getV3Pools(
      chainId: 8453
      first: 25
      skip: 0
      orderBy: totalLiquidity
      orderDirection: desc
      textSearch: null
    ) {
      ...GqlV3PoolFragment
      __typename
    }
    count: poolGetV3PoolsCount(
      chainId: 8453
      first: 25
      skip: 0
      orderBy: totalLiquidity
      orderDirection: desc
      textSearch: null
    )
  }

  fragment GqlV3PoolFragment on GqlV3Pool {
    id
    address
    symbol
    feeTier
    swapFee
    type
    token0 {
      ...GqlTokenFragment
      __typename
    }
    token1 {
      ...GqlTokenFragment
      __typename
    }
    aprItems {
      id
      title
      type
      apr
      __typename
    }
    dynamicData {
      totalLiquidity
      fees24h
      volume24h
      reserves0
      reserves1
      __typename
    }
    __typename
  }

  fragment GqlTokenFragment on GqlToken {
    id
    address
    name
    symbol
    decimals
    chainId
    logoURI
    tradeable
    isQuoteToken
    isStableCoin
    currentPrice {
      price
      __typename
    }
    __typename
  }
`;

const apy = async () => {
  const data = await request(api, query);

  const pools = data.getV3Pools.map((p) => {
    const apyBase =
      p.aprItems.find((i) => i.type === 'SWAP_FEE')?.apr * 100 ?? null;
    const apyReward =
      p.aprItems.find((i) => i.type === 'NATIVE_REWARD')?.apr * 100 ?? null;

    return {
      pool: p.address,
      chain: 'base',
      project: 'basex',
      symbol: p.symbol,
      tvlUsd: p.dynamicData.totalLiquidity,
      apyBase,
      apyReward,
      underlyingTokens: [p.token0.address, p.token1.address],
      rewardTokens:
        apyReward > 0 ? ['0xd5046b976188eb40f6de40fb527f89c05b323385'] : null,
      url: `https://baseswap.fi/pool/v3/${p.id}`,
      volumeUsd1d: p.dynamicData.volume24h,
    };
  });

  return pools;
};

module.exports = {
  apy,
};
