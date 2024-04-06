const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const project = 'morphex-v2';

// Fantom
const tokenAddressMPXFantom = '0x66eEd5FF1701E6ed8470DC391F05e27B1d0657eb';
const mlpManagerAddressFantom = '0x3A15Bac2D87C89F08147353fc9aE27080631b73d';

const feeMpxTrackerAddressFantom = '0x2D5875ab0eFB999c1f49C798acb9eFbd1cfBF63c';
const stakedMpxTrackerAddressFantom =
  '0xa4157E273D88ff16B3d8Df68894e1fd809DbC007';

const feeMlpTrackerAddressFantom = '0x0Af7E9F3396423C30a4dF4a79882d118ea89e2F2';
const stakedMlpTrackerAddressFantom =
  '0xB30A97548551Ac8b185685FC25bF3564cE6E716D';

// BNB Chain
const tokenAddressMPXBSC = '0x94C6B279b5df54b335aE51866d6E2A56BF5Ef9b7';
const mlpManagerAddressBSC = '0x749DA3a34A6E1b098F3BFaEd23DAD2b7D7846b9B';

const feeMpxTrackerAddressBSC = '0xfAEdbA0E97D5DCD7A29fB6778D7e17b1be35c0b8';
const stakedMpxTrackerAddressBSC = '0x13d2bBAE955c54Ab99F71Ff70833dE64482519B1';

const feeMlpTrackerAddressBSC = '0x1Fc9aB3b7bEE66fC29167AB205777537898ff235';
const stakedMlpTrackerAddressBSC = '0x4e0e48b787E308049d0CA6bfAA84D5c61c5a4A1e';

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
    target: pChain == 'fantom' ? mlpManagerAddressFantom : mlpManagerAddressBSC,
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
      pChain == 'fantom' ? tokenAddressMPXFantom : tokenAddressMPXBSC,
      pChain,
      'erc20:balanceOf',
      pChain == 'fantom'
        ? [stakedMpxTrackerAddressFantom]
        : [stakedMpxTrackerAddressBSC]
    ));

  const tvsMpx = pStakedMpx * pPriceData.mpx.price;
  const tvsEsMpx = pStakedEsMpx * pPriceData.mpx.price;

  const yearlyFeeMpx =
    pChain == 'fantom'
      ? pFeeMpx * pPriceData.fantom.price
      : pFeeMpx * pPriceData.bsc.price;
  const yearlyInflationMpx = pInflationMpx * pPriceData.mpx.price;

  const apyFee = (yearlyFeeMpx / tvsMpx) * 100;
  const apyInflation = (yearlyInflationMpx / tvsEsMpx) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol: utils.formatSymbol('MPX'),
    tvlUsd: tvlMpx,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      pChain === 'fantom' ? [tokenAddressMPXFantom] : [tokenAddressMPXBSC],
    underlyingTokens: [
      pChain === 'fantom' ? tokenAddressMPXFantom : tokenAddressMPXBSC,
    ],
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
    pChain == 'fantom'
      ? pFeeMlp * pPriceData.fantom.price
      : pFeeMlp * pPriceData.bsc.price;
  const yearlyInflationMlp = pInflationMlp * pPriceData.mpx.price;
  const apyFee = (yearlyFeeMlp / pTvl) * 100;
  const apyInflation = (yearlyInflationMlp / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project,
    symbol:
      pChain === 'fantom'
        ? utils.formatSymbol('MLP (FTM-BTC-ETH-USDC-USDT-DAI)')
        : utils.formatSymbol('MLP (BNB-BTC-ETH-XRP-ADA-USDT-USDC)'),
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens:
      pChain === 'fantom' ? [tokenAddressMPXFantom] : [tokenAddressMPXBSC],

    underlyingTokens: [
      pChain === 'fantom' ? tokenAddressMPXFantom : tokenAddressMPXBSC,
    ],
    underlyingTokens: [
      pChain === 'fantom'
        ? '0xF476F7F88E70470c976d9DF7c5C003dB1E1980Cb'
        : '0xbd1dCEc2103675C8F3953c34aE40Ed907E1DCAC2',
    ],
  };
}

const getPools = async () => {
  let pools = [];

  const priceKeys = ['fantom', 'binancecoin', 'mpx']
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const priceData = {
    mpx: prices['coingecko:mpx'],
    fantom: prices['coingecko:fantom'],
    bsc: prices['coingecko:binancecoin'],
  };

  // Fantom
  const fantomStakedMpx = await getAdjustedAmount(
    feeMpxTrackerAddressFantom,
    'fantom',
    'erc20:totalSupply'
  );
  const fantomStakedEsMpx = await getAdjustedAmount(
    stakedMpxTrackerAddressFantom,
    'fantom',
    'erc20:totalSupply'
  );
  const fantomFeeMpx = await getAdjustedAmount(
    feeMpxTrackerAddressFantom,
    'fantom',
    abi['tokensPerInterval']
  );
  const fantomInflationMpx = await getAdjustedAmount(
    stakedMpxTrackerAddressFantom,
    'fantom',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMPX(
      'fantom',
      stakedMpxTrackerAddressFantom,
      fantomStakedMpx,
      fantomStakedEsMpx,
      fantomFeeMpx,
      fantomInflationMpx,
      priceData
    )
  );

  const fantomFeeMlp = await getAdjustedAmount(
    feeMlpTrackerAddressFantom,
    'fantom',
    abi['tokensPerInterval']
  );
  const fantomInflationMlp = await getAdjustedAmount(
    stakedMlpTrackerAddressFantom,
    'fantom',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMLP(
      'fantom',
      await getMlpTVL('fantom'),
      stakedMlpTrackerAddressFantom,
      fantomFeeMlp,
      fantomInflationMlp,
      priceData
    )
  );

  // BSC
  const bscStakedMpx = await getAdjustedAmount(
    feeMpxTrackerAddressBSC,
    'bsc',
    'erc20:totalSupply'
  );
  const bscStakedEsMpx = await getAdjustedAmount(
    stakedMpxTrackerAddressBSC,
    'bsc',
    'erc20:totalSupply'
  );
  const bscFeeMpx = await getAdjustedAmount(
    feeMpxTrackerAddressBSC,
    'bsc',
    abi['tokensPerInterval']
  );
  const bscInflationMpx = await getAdjustedAmount(
    stakedMpxTrackerAddressBSC,
    'bsc',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMPX(
      'bsc',
      stakedMpxTrackerAddressBSC,
      bscStakedMpx,
      bscStakedEsMpx,
      bscFeeMpx,
      bscInflationMpx,
      priceData
    )
  );

  const bscFeeMlp = await getAdjustedAmount(
    feeMlpTrackerAddressBSC,
    'bsc',
    abi['tokensPerInterval']
  );
  const bscInflationMlp = await getAdjustedAmount(
    stakedMlpTrackerAddressBSC,
    'bsc',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMLP(
      'bsc',
      await getMlpTVL('bsc'),
      stakedMlpTrackerAddressBSC,
      bscFeeMlp,
      bscInflationMlp,
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
