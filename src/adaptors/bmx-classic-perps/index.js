const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const project = 'bmx-classic-perps';

// Base
const tokenAddressBMXBase = '0x548f93779fBC992010C07467cBaf329DD5F059B7';
const mlpManagerAddressBase = '0x9fAc7b75f367d5B35a6D6D0a09572eFcC3D406C5';
const bltUnderlyingTokensBase = [
  '0x4200000000000000000000000000000000000006',
  '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
];

const feeBmxTrackerAddressBase = '0x38E5be3501687500E6338217276069d16178077E';
const stakedBmxTrackerAddressBase =
  '0x3085F25Cbb5F34531229077BAAC20B9ef2AE85CB';

const feeBltTrackerAddressBase = '0xa2242d0A8b0b5c1A487AbFC03Cd9FEf6262BAdCA';
const stakedBltTrackerAddressBase =
  '0x2D5875ab0eFB999c1f49C798acb9eFbd1cfBF63c';

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
    target: mlpManagerAddressBase,
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
  pFeeBmx,
  pPriceData
) {
  const tvlBmx =
    pPriceData.bmx.price *
    (await getAdjustedAmount(
      tokenAddressBMXBase,
      pChain,
      'erc20:balanceOf',
      [stakedBmxTrackerAddressBase]
    ));

  const tvsBmx = pStakedBmx * pPriceData.bmx.price;

  const yearlyFeeBmx = pFeeBmx * pPriceData.ethereum.price;

  const apyFee = (yearlyFeeBmx / tvsBmx) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol: 'BMX',
    tvlUsd: tvlBmx,
    apyBase: apyFee,
    underlyingTokens: [tokenAddressBMXBase],
    url: 'https://classic.bmx.trade/deli-shop/single-staking',
  };
}

async function getPoolBLT(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeBlt,
  pPriceData
) {
  const yearlyFeeBlt = pFeeBlt * pPriceData.ethereum.price;
  const apyFee = (yearlyFeeBlt / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol: 'ETH-cbBTC-USDC',
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    underlyingTokens: bltUnderlyingTokensBase,
    poolMeta: 'BLT',
    url: 'https://classic.bmx.trade/deli-shop/mint',
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['ethereum', 'bmx'].map((t) => `coingecko:${t}`).join(',');
  const { coins: prices } = await utils.getPriceApiData(`/prices/current/${priceKeys}`);

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
  const baseFeeBmx = await getAdjustedAmount(
    feeBmxTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBMX(
      'base',
      stakedBmxTrackerAddressBase,
      baseStakedBmx,
      baseFeeBmx,
      priceData
    )
  );

  const baseFeeBlt = await getAdjustedAmount(
    feeBltTrackerAddressBase,
    'base',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolBLT(
      'base',
      await getBltTVL('base'),
      stakedBltTrackerAddressBase,
      baseFeeBlt,
      priceData
    )
  );

  return pools;
};

module.exports = {
  protocolId: '3530',
  timetravel: false,
  apy: getPools,
};
