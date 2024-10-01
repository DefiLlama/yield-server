const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const project = 'bmx-classic-perps';

// Base
const tokenAddressBMXBase = '0x548f93779fBC992010C07467cBaf329DD5F059B7';
const mlpManagerAddressBase = '0x9fAc7b75f367d5B35a6D6D0a09572eFcC3D406C5';

const feeBmxTrackerAddressBase = '0x38E5be3501687500E6338217276069d16178077E';
const stakedBmxTrackerAddressBase =
  '0x3085F25Cbb5F34531229077BAAC20B9ef2AE85CB';

const feeBltTrackerAddressBase = '0xa2242d0A8b0b5c1A487AbFC03Cd9FEf6262BAdCA';
const stakedBltTrackerAddressBase =
  '0x2D5875ab0eFB999c1f49C798acb9eFbd1cfBF63c';

// Mode
const tokenAddressBMXMode = '0x66eEd5FF1701E6ed8470DC391F05e27B1d0657eb';
const mlpManagerAddressMode = '0xf9Fc0B2859f9B6d33fD1Cea5B0A9f1D56C258178';

const feeBmxTrackerAddressMode = '0x548f93779fBC992010C07467cBaf329DD5F059B7';
const stakedBmxTrackerAddressMode =
  '0x773F34397d5F378D993F498Ee646FFe4184E00A3';

const feeBltTrackerAddressMode = '0xCcBF79AA51919f1711E40293a32bbC71F8842FC3';
const stakedBltTrackerAddressMode =
  '0x6c72ADbDc1029ee901dC97C5604487285D972A4f';

const secondsPerYear = 31536000;

async function getAdjustedAmount(pTarget, pChain, pAbi, pParams = []) {
  let decimals = await sdk.api.abi.call({
    target: pTarget,
    abi: 'erc20:decimals',
    chain: pChain,
  });
  let supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval']
    ? supply.output * 10 ** -decimals.output * secondsPerYear
    : supply.output * 10 ** -decimals.output;
}

async function getBltTVL(pChain) {
  let tvl = await sdk.api.abi.call({
    target: pChain == 'base' ? mlpManagerAddressBase : mlpManagerAddressMode,
    abi: abi['getAumInUsdg'],
    chain: pChain,
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function getPoolBMX(
  pChain,
  pInflationTrackerAddress,
  pStakedBmx,
  pStakedEsBmx,
  pFeeBmx,
  pInflationBmx,
  pPriceData
) {
  const tvlBmx =
    pPriceData.bmx.price *
    (await getAdjustedAmount(
      pChain == 'base' ? tokenAddressBMXBase : tokenAddressBMXMode,
      pChain,
      'erc20:balanceOf',
      pChain == 'base'
        ? [stakedBmxTrackerAddressBase]
        : [stakedBmxTrackerAddressMode]
    ));

  const tvsBmx = pStakedBmx * pPriceData.bmx.price;
  const tvsEsBmx = pStakedEsBmx * pPriceData.bmx.price;

  const yearlyFeeBmx = pFeeBmx * pPriceData.ethereum.price;
  const yearlyInflationBmx = pInflationBmx * pPriceData.bmx.price;

  const apyFee = (yearlyFeeBmx / tvsBmx) * 100;
  const apyInflation = (yearlyInflationBmx / tvsEsBmx) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol: utils.formatSymbol('BMX'),
    tvlUsd: tvlBmx,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      pChain === 'base' ? [tokenAddressBMXBase] : [tokenAddressBMXMode],
    underlyingTokens: [
      pChain === 'base' ? tokenAddressBMXBase : tokenAddressBMXMode,
    ],
  };
}

async function getPoolBLT(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeBlt,
  pInflationBlt,
  pPriceData
) {
  const yearlyFeeBlt = pFeeBlt * pPriceData.ethereum.price;
  const yearlyInflationBlt = pInflationBlt * pPriceData.bmx.price;
  const apyFee = (yearlyFeeBlt / pTvl) * 100;
  const apyInflation = (yearlyInflationBlt / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol:
      pChain === 'base'
        ? 'ETH-BTC-YFI-AERO-MOG-USDC-USDbC'
        : 'ETH-BTC-MODE-weETH-USDC',
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      pChain === 'base' ? [tokenAddressBMXBase] : [tokenAddressBMXMode],
    underlyingTokens: [
      pChain === 'base'
        ? '0xe771b4E273dF31B85D7A7aE0Efd22fb44BdD0633'
        : '0x952AdBB385296Dcf86a668f7eaa02DF7eb684439',
    ],
    poolMeta: pChain === 'base' ? 'BLT' : 'MLT',
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['ethereum', 'bmx'].map((t) => `coingecko:${t}`).join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const priceData = {
    bmx: prices['coingecko:bmx'],
    ethereum: prices['coingecko:ethereum'],
  };

  // Base
  const baseStakedBmx = await getAdjustedAmount(
    feeBmxTrackerAddressBase,
    'base',
    'erc20:totalSupply'
  );
  const baseStakedEsBmx = await getAdjustedAmount(
    stakedBmxTrackerAddressBase,
    'base',
    'erc20:totalSupply'
  );
  const baseFeeBmx = await getAdjustedAmount(
    feeBmxTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  const baseInflationBmx = await getAdjustedAmount(
    stakedBmxTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBMX(
      'base',
      stakedBmxTrackerAddressBase,
      baseStakedBmx,
      baseStakedEsBmx,
      baseFeeBmx,
      baseInflationBmx,
      priceData
    )
  );

  const baseFeeBlt = await getAdjustedAmount(
    feeBltTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  const baseInflationBlt = await getAdjustedAmount(
    stakedBltTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBLT(
      'base',
      await getBltTVL('base'),
      stakedBltTrackerAddressBase,
      baseFeeBlt,
      baseInflationBlt,
      priceData
    )
  );

  // Mode
  const modeStakedBmx = await getAdjustedAmount(
    feeBmxTrackerAddressMode,
    'mode',
    'erc20:totalSupply'
  );
  const modeStakedEsBmx = await getAdjustedAmount(
    stakedBmxTrackerAddressMode,
    'mode',
    'erc20:totalSupply'
  );
  const modeFeeBmx = await getAdjustedAmount(
    feeBmxTrackerAddressMode,
    'mode',
    abi['tokensPerInterval']
  );
  const modeInflationBmx = await getAdjustedAmount(
    stakedBmxTrackerAddressMode,
    'mode',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBMX(
      'mode',
      stakedBmxTrackerAddressMode,
      modeStakedBmx,
      modeStakedEsBmx,
      modeFeeBmx,
      modeInflationBmx,
      priceData
    )
  );

  const modeFeeBlt = await getAdjustedAmount(
    feeBltTrackerAddressMode,
    'mode',
    abi['tokensPerInterval']
  );
  const modeInflationBlt = await getAdjustedAmount(
    stakedBltTrackerAddressMode,
    'mode',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBLT(
      'mode',
      await getBltTVL('mode'),
      stakedBltTrackerAddressMode,
      modeFeeBlt,
      modeInflationBlt,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://www.bmx.trade/deli-shop',
};
