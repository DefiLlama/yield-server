const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { poolABI } = require('./abi');

const assets = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  wETH: '0x4200000000000000000000000000000000000006',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  wstETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
};

const pools = {
  USDC: '0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1',
  wETH: '0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2',
};

const getCollfactors = async () => {
  const erc20AssetModule = '0xfBecEaFC96ed6fc800753d3eE6782b6F9a60Eed7';

  const callsWeth = Object.values(assets).map((assetAddress) => ({
    target: erc20AssetModule,
    params: [pools.wETH, assetAddress, 0], //[creditor, asset, assetId=0 for erc20]
  }));

  const callsUsdc = Object.values(assets).map((assetAddress) => ({
    target: erc20AssetModule,
    params: [pools.USDC, assetAddress, 0], //[creditor, asset, assetId=0 for erc20]
  }));

  const collFactorsWeth = await sdk.api.abi.multiCall({
    abi: 'function getRiskFactors(address creditor, address asset, uint256 assetId) external view returns (uint16 collateralFactor, uint16 liquidationFactor)',
    calls: callsWeth,
    chain: 'base',
  });
  const collFactorsUsdc = await sdk.api.abi.multiCall({
    abi: 'function getRiskFactors(address creditor, address asset, uint256 assetId) external view returns (uint16 collateralFactor, uint16 liquidationFactor)',
    calls: callsUsdc,
    chain: 'base',
  });

  const extractCollateralFactor = (factors) =>
    factors.map((factor) => parseInt(factor.output.collateralFactor));

  const wethFactors = extractCollateralFactor(collFactorsWeth.output);
  const usdcFactors = extractCollateralFactor(collFactorsUsdc.output);

  const maxWethFactor = Math.max(...wethFactors);
  const maxUsdcFactor = Math.max(...usdcFactors);

  return { maxWethFactor, maxUsdcFactor };
};

const getApy = async () => {
  const coinPrices = await utils.getData(
    'https://coins.llama.fi/prices/current/base:0x4200000000000000000000000000000000000006,base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  );

  const wethPrice =
    coinPrices['coins']['base:0x4200000000000000000000000000000000000006']
      .price;
  const usdcPrice =
    coinPrices['coins']['base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']
      .price;

  const totalDebtWeth = await sdk.api.abi.call({
    target: pools.wETH,
    abi: poolABI.filter(({ name }) => name === 'totalAssets')[0],
    chain: 'base',
  });
  const totalLiquidityWeth = await sdk.api.abi.call({
    target: pools.wETH,
    abi: poolABI.filter(({ name }) => name === 'totalLiquidity')[0],
    chain: 'base',
  });
  const interestRateWeth = await sdk.api.abi.call({
    target: pools.wETH,
    abi: poolABI.filter(({ name }) => name === 'interestRate')[0],
    chain: 'base',
  });
  const apyWeth = (totalDebtWeth.output * interestRateWeth.output) / totalLiquidityWeth.output / 1e18;
  const tvlUsdWeth = ((totalLiquidityWeth.output - totalDebtWeth.output) * wethPrice) / 1e18;
  const totalSupplyUsdWeth = (totalLiquidityWeth.output * wethPrice) / 1e18;
  const totalBorrowUsdWeth = (totalDebtWeth.output * wethPrice) / 1e18;
  const borrowApyWeth = (interestRateWeth.output * 100) / 1e18; //interestRateWeth is in 18 decimals, times 100 for pct

  const totalDebtUsdc = await sdk.api.abi.call({
    target: pools.USDC,
    abi: poolABI.filter(({ name }) => name === 'totalAssets')[0],
    chain: 'base',
  });
  const totalLiquidityUsdc = await sdk.api.abi.call({
    target: pools.USDC,
    abi: poolABI.filter(({ name }) => name === 'totalLiquidity')[0],
    chain: 'base',
  });
  const interestRateUsdc = await sdk.api.abi.call({
    target: pools.USDC,
    abi: poolABI.filter(({ name }) => name === 'interestRate')[0],
    chain: 'base',
  });
  const apyUsdc = (totalDebtUsdc.output * interestRateUsdc.output) / totalLiquidityUsdc.output / 1e18;
  const tvlUsdUsdc = ((totalLiquidityUsdc.output - totalDebtUsdc.output) * usdcPrice) / 1e6;
  const totalSupplyUsdUsdc = (totalLiquidityUsdc.output * usdcPrice) / 1e6;
  const totalBorrowUsdUsdc = (totalDebtUsdc.output * usdcPrice) / 1e6;
  const borrowApyUsdc = (interestRateUsdc.output * 100) / 1e18; //interestRateUsdc is in 18 decimals, times 100 for pct

  const maxCollFactors = await getCollfactors();

  return [
    {
      pool: pools.wETH,
      chain: utils.formatChain('base'),
      project: 'arcadia-v2',
      symbol: 'wETH',
      tvlUsd: tvlUsdWeth,
      apyBase: apyWeth * 100,
      totalSupplyUsd: totalSupplyUsdWeth,
      totalBorrowUsd: totalBorrowUsdWeth,
      apyBaseBorrow: borrowApyWeth,
      ltv: maxCollFactors.maxWethFactor / 10_000, // 4 decimal precision
      poolMeta: 'Arcadia V2 WETH Pool',
      underlyingTokens: ['0x4200000000000000000000000000000000000006'], // WETH
      url: 'https://arcadia.finance/pool/8453/0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2',
    },
    {
      pool: pools.USDC,
      chain: utils.formatChain('base'),
      project: 'arcadia-v2',
      symbol: 'USDC',
      tvlUsd: tvlUsdUsdc,
      apyBase: apyUsdc * 100,
      totalSupplyUsd: totalSupplyUsdUsdc,
      totalBorrowUsd: totalBorrowUsdUsdc,
      apyBaseBorrow: borrowApyUsdc,
      ltv: maxCollFactors.maxUsdcFactor / 10_000, // 4 decimal precision
      poolMeta: 'Arcadia V2 USDC Pool',
      underlyingTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'], // USDC
      url: 'https://arcadia.finance/pool/8453/0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://arcadia.finance/earn',
};
