const { request, gql } = require('graphql-request');
const Web3 = require('web3');
const utils = require('../utils');

// Subgraph URLs
const urlFantom = 'https://backend.beets-ftm-node.com/graphql';
const urlOp = 'https://backend-v3.beets-ftm-node.com/';
const rewardToken = '0xf24bcf4d1e507740041c9cfd2dddb29585adce1e';
// aprToApy
const buildPool = (el, chainString) => {
  const symbol = el.linearPools
    ? utils.formatSymbol(
        el.linearPools
          .map((item) => item.mainToken.symbol)
          .concat(
            (
              el.tokens.find(
                ({ isBpt, isPhantomBpt }) =>
                  isBpt === false && isPhantomBpt === false
              ) || {}
            ).symbol
          )
          .join('-')
      )
    : utils.formatSymbol(el.tokens.map((item) => item.symbol).join('-'));
  const aprFee = el.apr.items.find((e) => e.title === 'Swap fees APR');
  const aprReward = el.apr.items.find((e) => e.title !== 'Swap fees APR');
  const newObj = {
    pool: el.id,
    chain: utils.formatChain(chainString),
    project: 'beethoven-x',
    symbol: symbol,
    tvlUsd: parseFloat(el.totalLiquidity),
    apyBase: utils.aprToApy(Number(aprFee?.apr || 0)) * 100,
    apyReward: utils.aprToApy(Number(aprReward?.apr || 0)) * 100,
    rewardTokens: [rewardToken],
    url: `https://${chainString === 'optimism' ? 'op.' : ''}beets.fi/pool/${
      el.id
    }`,
  };

  return newObj;
};

const main = async () => {
  const fantomData = await utils.getData(urlFantom, {
    query:
      'query { pools { id name address poolType swapFee tokensList mainTokens farmTotalLiquidity totalLiquidity totalSwapVolume totalSwapFee totalShares totalWeight owner factory amp createTime swapEnabled farm { id pair allocPoint slpBalance masterChef { id totalAllocPoint beetsPerBlock } rewarder { id rewardToken rewardPerSecond tokens { rewardPerSecond symbol token tokenPrice } } rewardTokens { decimals address rewardPerDay rewardPerSecond tokenPrice isBeets symbol } } volume24h fees24h isNewPool apr { total hasRewardApr swapApr beetsApr thirdPartyApr items { title apr subItems { title apr } } } tokens { name symbol decimals address balance weight priceRate isBpt isPhantomBpt } wrappedIndex mainIndex lowerTarget upperTarget tokenRates expiryTime stablePhantomPools { id address symbol totalSupply balance tokens { name symbol decimals address balance weight priceRate isBpt isPhantomBpt } } linearPools { id symbol address priceRate totalSupply balance mainTokenTotalBalance unwrappedTokenAddress mainToken { index address balance name symbol decimals } wrappedToken { index address balance priceRate name symbol decimals } poolToken } } }',
  });

  const queryOptimsim = {
    operationName: 'GetPools',
    variables: {
      first: 100,
      skip: 0,
      orderBy: 'totalLiquidity',
      orderDirection: 'desc',
      where: {
        categoryIn: ['INCENTIVIZED'],
        poolTypeIn: ['WEIGHTED', 'STABLE', 'PHANTOM_STABLE', 'META_STABLE'],
        chainIn: ['OPTIMISM'],
      },
      textSearch: '',
    },
    query:
      'query GetPools($first: Int, $skip: Int, $orderBy: GqlPoolOrderBy, $orderDirection: GqlPoolOrderDirection, $where: GqlPoolFilter, $textSearch: String) {\n  poolGetPools(\n    first: $first\n    skip: $skip\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n    where: $where\n    textSearch: $textSearch\n  ) {\n    ...GqlPoolMinimal\n    __typename\n  }\n  count: poolGetPoolsCount(\n    first: $first\n    skip: $skip\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n    where: $where\n    textSearch: $textSearch\n  )\n}\n\nfragment GqlPoolMinimal on GqlPoolMinimal {\n  id\n  address\n  name\n  symbol\n  createTime\n  dynamicData {\n    totalLiquidity\n    totalShares\n    fees24h\n    swapFee\n    volume24h\n    apr {\n      hasRewardApr\n      thirdPartyApr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      nativeRewardApr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      swapApr\n      apr {\n        ... on GqlPoolAprTotal {\n          total\n          __typename\n        }\n        ... on GqlPoolAprRange {\n          min\n          max\n          __typename\n        }\n        __typename\n      }\n      items {\n        id\n        title\n        apr {\n          ... on GqlPoolAprTotal {\n            total\n            __typename\n          }\n          ... on GqlPoolAprRange {\n            min\n            max\n            __typename\n          }\n          __typename\n        }\n        subItems {\n          id\n          title\n          apr {\n            ... on GqlPoolAprTotal {\n              total\n              __typename\n            }\n            ... on GqlPoolAprRange {\n              min\n              max\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  allTokens {\n    id\n    address\n    isNested\n    isPhantomBpt\n    weight\n    symbol\n    __typename\n  }\n  displayTokens {\n    id\n    address\n    name\n    weight\n    symbol\n    nestedTokens {\n      id\n      address\n      name\n      weight\n      symbol\n      __typename\n    }\n    __typename\n  }\n  staking {\n    id\n    type\n    address\n    farm {\n      id\n      beetsPerBlock\n      rewarders {\n        id\n        address\n        tokenAddress\n        rewardPerSecond\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}',
  };
  const opData = await utils.getData(urlOp, queryOptimsim);

  const dataFantom = fantomData?.data.pools
    .filter((el) => el.totalLiquidity !== '0')
    .map((el) => buildPool(el, 'fantom'))
    .flat();

  let dataOptimism = opData?.data.poolGetPools.filter(
    (el) => el.dynamicData.totalLiquidity !== '0'
  );

  dataOptimism = dataOptimism.map((p) => {
    const apyBase = p.dynamicData.apr.swapApr * 100;
    const apyReward =
      (Number(p.dynamicData.apr.thirdPartyApr.total) +
        Number(p.dynamicData.apr.nativeRewardApr.total)) *
      100;

    const symbol = p.allTokens.map((t) => t.symbol).join('-');

    return {
      pool: `${p.address}-optimism`,
      chain: 'Optimism',
      project: 'beethoven-x',
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
    };
  });

  const data = [...dataFantom, ...dataOptimism];

  return data;
};
module.exports = {
  timetravel: false,
  apy: main,
};
