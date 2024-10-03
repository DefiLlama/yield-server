const superagent = require('superagent');

const abi = require('./abi.js');
const sdk = require('@defillama/sdk');

const markets = [
  {
    address: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
    symbol: 'cUSDCv3',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    underlyingSymbol: 'USDC',
    rewardToken: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    chain: 'ethereum',
  },
  {
    address: '0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840',
    symbol: 'cUSDTv3',
    underlying: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    underlyingSymbol: 'USDT',
    rewardToken: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    chain: 'ethereum',
  },
  {
    address: '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
    symbol: 'cWETHv3',
    underlying: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    underlyingSymbol: 'ETH',
    rewardToken: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    chain: 'ethereum',
  },
  {
    address: '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
    symbol: 'cUSDCv3',
    underlying: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    underlyingSymbol: 'USDC',
    rewardToken: '0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c',
    chain: 'polygon',
  },
  {
    address: '0xaeB318360f27748Acb200CE616E389A6C9409a07',
    symbol: 'cUSDTv3',
    underlying: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    underlyingSymbol: 'USDT',
    rewardToken: '0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c',
    chain: 'polygon',
  },
  {
    address: '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
    symbol: 'cUSDCv3',
    underlying: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    underlyingSymbol: 'USDC',
    rewardToken: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE',
    chain: 'arbitrum',
  },
  {
    address: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    symbol: 'cUSDCv3-native',
    underlying: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    underlyingSymbol: 'USDC',
    rewardToken: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE',
    chain: 'arbitrum',
  },
  {
    address: '0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486',
    symbol: 'cWETHv3',
    underlying: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    underlyingSymbol: 'WETH',
    rewardToken: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE',
    chain: 'arbitrum',
  },
  {
    address: '0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07',
    symbol: 'cUSDTv3',
    underlying: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    underlyingSymbol: 'USDT',
    rewardToken: '0x354A6dA3fcde098F8389cad84b0182725c6C91dE',
    chain: 'arbitrum',
  },
  {
    address: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    symbol: 'cUSDbCv3',
    underlying: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    underlyingSymbol: 'USDbC',
    rewardToken: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
    chain: 'base',
  },
  {
    address: '0x46e6b214b524310239732D51387075E0e70970bf',
    symbol: 'cWETHv3',
    underlying: '0x4200000000000000000000000000000000000006',
    underlyingSymbol: 'WETH',
    rewardToken: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
    chain: 'base',
  },
  {
    address: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
    symbol: 'cUSDCv3',
    underlying: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    underlyingSymbol: 'USDC',
    rewardToken: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
    chain: 'base',
  },
  {
    address: '0xB2f97c1Bd3bf02f5e74d13f02E3e26F93D77CE44',
    symbol: 'cUSDCv3',
    underlying: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
    underlyingSymbol: 'USDC',
    rewardToken: '0x643e160a3C3E2B7eae198f0beB1BfD2441450e86',
    chain: 'scroll',
  },
  {
    address: '0x2e44e174f7D53F0212823acC11C01A11d58c5bCB',
    symbol: 'cUSDCv3-native',
    underlying: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    underlyingSymbol: 'USDC',
    rewardToken: '0x7e7d4467112689329f7E06571eD0E8CbAd4910eE',
    chain: 'optimism',
  },
  {
    address: '0x995E394b8B2437aC8Ce61Ee0bC610D617962B214',
    symbol: 'cUSDTv3',
    underlying: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    underlyingSymbol: 'USDT',
    rewardToken: '0x7e7d4467112689329f7E06571eD0E8CbAd4910eE',
    chain: 'optimism',
  },
];

const main = async (pool) => {
  const numAssets = (
    await sdk.api.abi.call({
      target: pool.address,
      abi: abi.find((i) => i.name === 'numAssets'),
      chain: pool.chain,
    })
  ).output;

  // contains token addresses and c-factors
  const assetInfoRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'getAssetInfo'),
    calls: [...Array(Number(numAssets)).keys()].map((i) => ({
      target: pool.address,
      params: i,
    })),
    chain: pool.chain,
  });
  const assetInfo = assetInfoRes.output.map((o) => o.output);
  const tokens = assetInfo.map((a) => a.asset);

  // symbols
  const symbolsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:symbol',
    calls: tokens.map((t) => ({
      target: t,
    })),
    chain: pool.chain,
  });
  const symbols = symbolsRes.output.map((o) => o.output);

  // collateral balances
  const totalsCollateralRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'totalsCollateral'),
    calls: tokens.map((t) => ({
      target: pool.address,
      params: t,
    })),
    chain: pool.chain,
  });
  const totalsCollateral = totalsCollateralRes.output.map((o) => o.output);

  // get prices
  const priceKeys = [
    `${pool.chain}:${pool.underlying}`,
    `${pool.chain}:${pool.rewardToken}`,
    ...tokens.map((t) => `${pool.chain}:${t}`),
  ].join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const collateralDecimalsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    chain: pool.chain,
    calls: tokens.map((t) => ({ target: t })),
  });
  const collateralDecimals = collateralDecimalsRes.output.map((o) => o.output);

  // calc collateral in usd
  const collateralTotalSupplyUsd = tokens.map(
    (t, i) =>
      (Number(totalsCollateral[i].totalSupplyAsset) *
        prices[`${pool.chain}:${t}`].price) /
      10 ** Number(collateralDecimals[i])
  );

  // pool utilization
  const utilization = (
    await sdk.api.abi.call({
      target: pool.address,
      abi: abi.find((i) => i.name === 'getUtilization'),
      chain: pool.chain,
    })
  ).output;

  // get rate data
  const [
    supplyRate,
    borrowRate,
    baseTrackingBorrowSpeed,
    baseTrackingSupplySpeed,
    totalBorrow,
    totalSupply,
    trackingIndexScale,
    decimals,
  ] = (
    await Promise.all(
      [
        'getSupplyRate',
        'getBorrowRate',
        'baseTrackingBorrowSpeed',
        'baseTrackingSupplySpeed',
        'totalBorrow',
        'totalSupply',
        'trackingIndexScale',
        'decimals',
      ].map((method) =>
        sdk.api.abi.call({
          target: pool.address,
          abi: abi.find((i) => i.name === method),
          params:
            method === 'getSupplyRate' || method === 'getBorrowRate'
              ? [utilization]
              : null,
          chain: pool.chain,
        })
      )
    )
  ).map((o) => o.output);

  // --- pool array

  // 1) collateral pools (no apy fields)
  const collateralOnlyPools = tokens.map((t, i) => ({
    pool: `${t}-${pool.symbol}-${pool.chain}`,
    symbol: symbols[i],
    chain: pool.chain.charAt(0).toUpperCase() + pool.chain.slice(1),
    project: 'compound-v3',
    tvlUsd: collateralTotalSupplyUsd[i],
    apy: 0,
    underlyingTokens: [t],
    // borrow fields
    totalSupplyUsd: collateralTotalSupplyUsd[i],
    ltv: assetInfo[i].borrowCollateralFactor / 1e18,
    poolMeta: `${pool.underlyingSymbol}-pool`,
    borrowable: false,
  }));

  // 2) usdc pool
  // --- calc apy's
  const secondsPerYear = 60 * 60 * 24 * 365;
  const compPrice = prices[`${pool.chain}:${pool.rewardToken}`].price;
  const usdcPrice = prices[`${pool.chain}:${pool.underlying}`].price;

  // supply side
  const totalSupplyUsd = (totalSupply / 10 ** decimals) * usdcPrice;
  const apyBase = (supplyRate / 1e18) * secondsPerYear * 100;
  const apyReward =
    (((baseTrackingSupplySpeed / trackingIndexScale) *
      secondsPerYear *
      compPrice) /
      totalSupplyUsd) *
    100;

  // borrow side
  const totalBorrowUsd = (totalBorrow / 10 ** decimals) * usdcPrice;
  const apyBaseBorrow = (borrowRate / 1e18) * secondsPerYear * 100;
  const apyRewardBorrow =
    (((baseTrackingBorrowSpeed / trackingIndexScale) *
      secondsPerYear *
      compPrice) /
      totalBorrowUsd) *
    100;

  return [
    ...collateralOnlyPools,
    {
      pool: `${pool.address}-${pool.chain}`,
      symbol: pool.underlyingSymbol,
      chain: pool.chain.charAt(0).toUpperCase() + pool.chain.slice(1),
      project: 'compound-v3',
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,
      apyReward,
      underlyingTokens: [pool.underlying],
      rewardTokens: [pool.rewardToken],
      // borrow fields
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      borrowable: true,
      ltv: 0,
    },
  ];
};

const apy = async () => {
  const pools = (await Promise.all(markets.map((p) => main(p)))).flat();
  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://v3-app.compound.finance/markets',
};
