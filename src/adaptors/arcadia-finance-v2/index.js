const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { poolABI } = require('./abi');

const getApy = async () => {
  const wethPool = '0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2';
  const usdcPool = '0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1';

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
    target: wethPool,
    abi: poolABI.filter(({ name }) => name === 'totalAssets')[0],
    chain: 'base',
  });
  const totalLiquidityWeth = await sdk.api.abi.call({
    target: wethPool,
    abi: poolABI.filter(({ name }) => name === 'totalLiquidity')[0],
    chain: 'base',
  });
  const interestRateWeth = await sdk.api.abi.call({
    target: wethPool,
    abi: poolABI.filter(({ name }) => name === 'interestRate')[0],
    chain: 'base',
  });
  const apyWeth =
    (totalDebtWeth * interestRateWeth) / totalLiquidityWeth / 1e18;
  const tvlUsdWeth = ((totalLiquidityWeth - totalDebtWeth) * wethPrice) / 1e18;
  const totalSupplyUsdWeth = (totalLiquidityWeth * wethPrice) / 1e18;

  const totalDebtUsdc = await sdk.api.abi.call({
    target: usdcPool,
    abi: poolABI.filter(({ name }) => name === 'totalAssets')[0],
    chain: 'base',
  });
  const totalLiquidityUsdc = await sdk.api.abi.call({
    target: usdcPool,
    abi: poolABI.filter(({ name }) => name === 'totalLiquidity')[0],
    chain: 'base',
  });
  const interestRateUsdc = await sdk.api.abi.call({
    target: usdcPool,
    abi: poolABI.filter(({ name }) => name === 'interestRate')[0],
    chain: 'base',
  });
  const apyUsdc =
    (totalDebtWeth * interestRateWeth) / totalLiquidityWeth / 1e18;
  const tvlUsdUsdc = ((totalLiquidityUsdc - totalDebtUsdc) * usdcPrice) / 1e18;
  const totalSupplyUsdUsdc = (totalLiquidityUsdc * usdcPrice) / 1e18;

  return [
    {
      pool: wethPool,
      chain: utils.formatChain(chains['base']),
      project: 'arcadia-finance-v2',
      symbol: 'wETH',
      tvlUsd: tvlUsdWeth,
      apyBase: apyWeth * 100,
      totalSupplyUsd: totalSupplyUsdWeth,
      poolMeta: 'Arcadia V2 WETH Pool',
      underlyingTokens: ['0x4200000000000000000000000000000000000006'], // WETH
      url: 'https://arcadia.finance/pool/8453/0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2',
    },
    {
      pool: usdcPool,
      chain: utils.formatChain(chains['base']),
      project: 'arcadia-finance-v2',
      symbol: 'USDC',
      tvlUsd: tvlUsdUsdc,
      apyBase: apyUsdc * 100,
      totalSupplyUsd: totalSupplyUsdUsdc,
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
