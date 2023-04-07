const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const tokenAddressMPX = '0x66eEd5FF1701E6ed8470DC391F05e27B1d0657eb';
const mlpManagerAddress = '0xA3Ea99f8aE06bA0d9A6Cf7618d06AEa4564340E9';

const feeMpxTrackerAddress = '0x2D5875ab0eFB999c1f49C798acb9eFbd1cfBF63c';
const stakedMpxTrackerAddress = '0xa4157E273D88ff16B3d8Df68894e1fd809DbC007';

const feeMlpTrackerAddress = '0xd3C5dEd5F1207c80473D39230E5b0eD11B39F905';
const stakedMlpTrackerAddress = '0x49A97680938B4F1f73816d1B70C3Ab801FAd124B';

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

async function getMlpTVL(pChain) {
  let tvl = await sdk.api.abi.call({
    target: pChain == 'fantom' ? mlpManagerAddress : '',
    abi: abi['getAumInUsdg'],
    chain: pChain,
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function getPoolMPX(
  pChain,
  pInflationTrackerAddress,
  pStakedMpx,
  pStakedEsMpx,
  pFeeMpx,
  pInflationMpx,
  pPriceData
) {
  const tvlMpx =
    pPriceData.mpx.price *
    (await getAdjustedAmount(
      pChain == 'fantom' ? tokenAddressMPX : '',
      pChain,
      'erc20:balanceOf',
      pChain == 'fantom' ? [stakedMpxTrackerAddress] : []
    ));

  const tvsMpx = pStakedMpx * pPriceData.mpx.price;
  const tvsEsMpx = pStakedEsMpx * pPriceData.mpx.price;

  const yearlyFeeMpx =
    pChain == 'fantom' ? pFeeMpx * pPriceData.fantom.price : 0;
  const yearlyInflationMpx = pInflationMpx * pPriceData.mpx.price;

  const apyFee = (yearlyFeeMpx / tvsMpx) * 100;
  const apyInflation = (yearlyInflationMpx / tvsEsMpx) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'morphex',
    symbol: utils.formatSymbol('MPX'),
    tvlUsd: tvlMpx,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens: pChain === 'fantom' ? [tokenAddressMPX] : [],
    underlyingTokens: [pChain === 'fantom' ? tokenAddressMPX : ''],
  };
}

async function getPoolMLP(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeMlp,
  pInflationMlp,
  pPriceData
) {
  const yearlyFeeMlp =
    pChain == 'fantom' ? pFeeMlp * pPriceData.fantom.price : 0;
  const yearlyInflationMlp = pInflationMlp * pPriceData.mpx.price;
  const apyFee = (yearlyFeeMlp / pTvl) * 100;
  const apyInflation = (yearlyInflationMlp / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'morphex',
    symbol: utils.formatSymbol('MLP (FTM-BTC-ETH-USDC-USDT-DAI)'),
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens: pChain === 'fantom' ? [tokenAddressMPX] : [],

    underlyingTokens: [pChain === 'fantom' ? tokenAddressMPX : ''],
    underlyingTokens: [
      pChain === 'fantom' ? '0xd5c313DE2d33bf36014e6c659F13acE112B80a8E' : '',
    ],
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['fantom', 'mpx'].map((t) => `coingecko:${t}`).join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const priceData = {
    mpx: prices['coingecko:mpx'],
    fantom: prices['coingecko:fantom'],
  };

  const fantomStakedMpx = await getAdjustedAmount(
    feeMpxTrackerAddress,
    'fantom',
    'erc20:totalSupply'
  );
  const fantomStakedEsMpx = await getAdjustedAmount(
    stakedMpxTrackerAddress,
    'fantom',
    'erc20:totalSupply'
  );
  const fantomFeeMpx = await getAdjustedAmount(
    feeMpxTrackerAddress,
    'fantom',
    abi['tokensPerInterval']
  );
  const fantomInflationMpx = await getAdjustedAmount(
    stakedMpxTrackerAddress,
    'fantom',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMPX(
      'fantom',
      stakedMpxTrackerAddress,
      fantomStakedMpx,
      fantomStakedEsMpx,
      fantomFeeMpx,
      fantomInflationMpx,
      priceData
    )
  );

  const fantomFeeMlp = await getAdjustedAmount(
    feeMlpTrackerAddress,
    'fantom',
    abi['tokensPerInterval']
  );
  const fantomInflationMlp = await getAdjustedAmount(
    stakedMlpTrackerAddress,
    'fantom',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMLP(
      'fantom',
      await getMlpTVL('fantom'),
      stakedMlpTrackerAddress,
      fantomFeeMlp,
      fantomInflationMlp,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://www.morphex.trade/earn',
};
