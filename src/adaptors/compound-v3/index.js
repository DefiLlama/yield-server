const superagent = require('superagent');

const abi = require('./abi.js');
const sdk = require('@defillama/sdk');

const apy = async () => {
  const cUSDCv3 = '0xc3d688B66703497DAA19211EEdff47f25384cdc3';
  const rewardToken = '0xc00e94Cb662C3520282E6f5717214004A7f26888';
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const numAssets = (
    await sdk.api.abi.call({
      target: cUSDCv3,
      abi: abi.find((i) => i.name === 'numAssets'),
      chain: 'ethereum',
    })
  ).output;

  // contains token addresses and c-factors
  const assetInfoRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'getAssetInfo'),
    calls: [...Array(Number(numAssets)).keys()].map((i) => ({
      target: cUSDCv3,
      params: i,
    })),
    chain: 'ethereum',
  });
  const assetInfo = assetInfoRes.output.map((o) => o.output);
  const tokens = assetInfo.map((a) => a.asset);

  // symbols
  const symbolsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:symbol',
    calls: tokens.map((t) => ({
      target: t,
    })),
  });
  const symbols = symbolsRes.output.map((o) => o.output);

  // collateral balances
  const totalsCollateralRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'totalsCollateral'),
    calls: tokens.map((t) => ({
      target: cUSDCv3,
      params: t,
    })),
    chain: 'ethereum',
  });
  const totalsCollateral = totalsCollateralRes.output.map((o) => o.output);

  // get prices
  const priceKeys = [
    `ethereum:${usdc}`,
    ...tokens.map((t) => `ethereum:${t}`),
  ].join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const collateralDecimalsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    chain: 'ethereum',
    calls: tokens.map((t) => ({ target: t })),
  });
  const collateralDecimals = collateralDecimalsRes.output.map((o) => o.output);

  // calc collateral in usd
  const collateralTotalSupplyUsd = tokens.map(
    (t, i) =>
      (Number(totalsCollateral[i].totalSupplyAsset) *
        prices[`ethereum:${t}`].price) /
      10 ** Number(collateralDecimals[i])
  );

  // pool utilization
  const utilization = (
    await sdk.api.abi.call({
      target: cUSDCv3,
      abi: abi.find((i) => i.name === 'getUtilization'),
      chain: 'ethereum',
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
          target: cUSDCv3,
          abi: abi.find((i) => i.name === method),
          params:
            method === 'getSupplyRate' || method === 'getBorrowRate'
              ? [utilization]
              : null,
          chain: 'ethereum',
        })
      )
    )
  ).map((o) => o.output);

  // --- pool array

  // 1) collateral pools (no apy fields)
  const collateralOnlyPools = tokens.map((t, i) => ({
    pool: `${t}-cUSDCv3`,
    symbol: symbols[i],
    chain: 'Ethereum',
    project: 'compound-v3',
    tvlUsd: collateralTotalSupplyUsd[i],
    apy: 0,
    underlyingTokens: [t],
    // borrow fields
    totalSupplyUsd: collateralTotalSupplyUsd[i],
    ltv: assetInfo[i].borrowCollateralFactor / 1e18,
  }));

  // 2) usdc pool
  // --- calc apy's
  const secondsPerYear = 60 * 60 * 24 * 365;
  const compPrice = prices[`ethereum:${rewardToken}`].price;
  const usdcPrice = prices[`ethereum:${usdc}`].price;

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
      pool: cUSDCv3,
      symbol: 'USDC',
      chain: 'Ethereum',
      project: 'compound-v3',
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,
      apyReward,
      underlyingTokens: [usdc],
      rewardTokens: [rewardToken],
      // borrow fields
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://v3-app.compound.finance/markets',
};
