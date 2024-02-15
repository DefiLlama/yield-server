const utils = require('../utils');

const buildQuery = (chain) => {
  return {
    operationName: 'GetPools',
    variables: {
      first: 100,
      skip: 0,
      orderBy: 'totalLiquidity',
      orderDirection: 'desc',
      where: {
        categoryIn: ['INCENTIVIZED'],
        poolTypeIn: ['WEIGHTED', 'STABLE', 'PHANTOM_STABLE', 'META_STABLE'],
        chainIn: [chain],
      },
      textSearch: '',
    },
    query:
      'query GetPools($first: Int, $skip: Int, $orderBy: GqlPoolOrderBy, $orderDirection: GqlPoolOrderDirection, $where: GqlPoolFilter, $textSearch: String) {\n  poolGetPools(\n    first: $first\n    skip: $skip\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n    where: $where\n    textSearch: $textSearch\n  ) {\n    ...GqlPoolMinimal\n    __typename\n  }\n  count: poolGetPoolsCount(\n    first: $first\n    skip: $skip\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n    where: $where\n    textSearch: $textSearch\n  )\n}\n\nfragment GqlPoolMinimal on GqlPoolMinimal {\n  id\n  address\n  name\n  symbol\n  createTime\n  dynamicData {\n    totalLiquidity\n    totalShares\n    fees24h\n    swapFee\n    volume24h\n    apr {\n      hasRewardApr\n      thirdPartyApr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      nativeRewardApr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      swapApr\n      apr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      items {\n        id\n        title\n        apr {\n          ... on GqlPoolAprTotal {\n            total\n            __typename\n          }\n          ... on GqlPoolAprRange {\n            min\n            max\n            __typename\n          }\n          __typename\n        }\n        subItems {\n          id\n          title\n          apr {\n            ... on GqlPoolAprTotal {\n              total\n              __typename\n            }\n            ... on GqlPoolAprRange {\n              min\n              max\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  allTokens {\n    id\n    address\n    isNested\n    isPhantomBpt\n    weight\n    symbol\n    __typename\n  }\n  displayTokens {\n    id\n    address\n    name\n    weight\n    symbol\n    nestedTokens {\n      id\n      address\n      name\n      weight\n      symbol\n      __typename\n    }\n    __typename\n  }\n  staking {\n    id\n    type\n    address\n    farm {\n      id\n      beetsPerBlock\n      rewarders {\n        id\n        address\n        tokenAddress\n        rewardPerSecond\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}',
  };
};

const apy = async () => {
  const chains = ['FANTOM', 'OPTIMISM'];
  const pools = await Promise.all(
    chains.map(async (chain) => {
      const data = (
        await utils.getData(
          'https://backend-v3.beets-ftm-node.com/',
          buildQuery(chain)
        )
      )?.data.poolGetPools.filter(
        (el) => el.dynamicData.totalLiquidity !== '0'
      );

      return data.map((p) => {
        const apyBase = p.dynamicData.apr.swapApr * 100;
        const apyReward =
          (Number(p.dynamicData.apr.thirdPartyApr.total) +
            Number(p.dynamicData.apr.nativeRewardApr.total)) *
          100;

        const symbol = p.allTokens.map((t) => t.symbol).join('-');

        return {
          pool:
            chain === 'FANTOM' ? p.id : `${p.address}-${chain.toLowerCase()}`,
          chain: utils.formatChain(chain.toLowerCase()),
          project: 'beethoven-x-dex',
          symbol:
            p.address === '0x43da214fab3315aa6c02e0b8f2bfb7ef2e3c60a5'
              ? 'USDC-DAI'
              : p.address === '0x23ca0306b21ea71552b148cf3c4db4fc85ae1929'
              ? 'DAI-USDT-USDC'
              : p.address === '0x098f32d98d0d64dba199fc1923d3bf4192e78719'
              ? 'WBTC-WSTEH-USDC'
              : symbol,
          tvlUsd: parseFloat(p.dynamicData.totalLiquidity),
          apyBase,
          apyReward,
          url: `https://op.beets.fi/pool/${p.id}`,
          underlyingTokens: p.allTokens.map((t) => t.address),
          rewardTokens:
            apyReward > 0
              ? ['0xf24bcf4d1e507740041c9cfd2dddb29585adce1e']
              : null,
        };
      });
    })
  );
  return pools.flat();
};

module.exports = {
  apy,
};
