const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const arbitrumMycAddress = '0xc74fe4c715510ec2f8c61d70d397b32043f55abe';
const arbitrumMlpAddress = '0x752b746426b6D0c3188bb530660374f92FD9cf7c';
const arbitrumMlpManagerAddress = '0x2DE28AB4827112Cd3F89E5353Ca5A8D80dB7018f';
const arbitrumFeeMycTrackerAddress =
  '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
const arbitrumInflationMycTrackerAddress =
  '0x2BC8E28f5d41a4b112BC62EB7Db1B757c85f37Ff';
const arbitrumFeeMlpTrackerAddress =
  '0xF0BFB95087E611897096982c33B6934C8aBfA083';
const arbitrumInflationMlpTrackerAddress =
  '0xF7Bd2ed13BEf9C27a2188f541Dc5ED85C5325306';

const SECONDS_PER_YEAR = 31536000;

async function getAdjustedAmount(pTarget, pChain, pAbi, pParams = []) {
  const decimals = await sdk.api.abi.call({
    target: pTarget,
    abi: 'erc20:decimals',
    chain: pChain,
  });
  const supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval']
    ? supply.output * 10 ** -decimals.output * SECONDS_PER_YEAR
    : supply.output * 10 ** -decimals.output;
}

async function getMlpTvl(pChain) {
  const tvl = await sdk.api.abi.call({
    target: arbitrumMlpManagerAddress,
    abi: abi['getAumInUsdg'],
    chain: pChain,
    params: [false],
  });

  return tvl.output * 10 ** -18;
}

async function getPoolMyc(
  pChain,
  pInflationTrackerAddress,
  pStakedMyc,
  pStakedEsMyc,
  pFeeMyc,
  pInflationMyc,
  pPriceData
) {
  const tvlMyc =
    pPriceData.mycelium.usd *
    (await getAdjustedAmount(
      arbitrumMycAddress,
      pChain,
      'erc20:balanceOf',
      arbitrumInflationMycTrackerAddress
    ));
  const tvsMyc = pStakedMyc * pPriceData.mycelium.usd;
  const tvsEsMyc = pStakedEsMyc * pPriceData.mycelium.usd;
  const yearlyFeeMyc = pFeeMyc * pPriceData.ethereum.usd;
  const yearlyInflationMyc = pInflationMyc * pPriceData.mycelium.usd;
  const apyFee = (yearlyFeeMyc / tvsMyc) * 100;
  const apyInflation = (yearlyInflationMyc / tvsEsMyc) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'mycelium.xyz',
    symbol: utils.formatSymbol('MYC'),
    tvlUsd: tvlMyc,
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens: [arbitrumMycAddress],
    underlyingTokens: [arbitrumMycAddress],
  };
}

async function getPoolMlp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeMlp,
  pInflationMlp,
  pPriceData
) {
  const yearlyFeeMlp = pFeeMlp * pPriceData.ethereum.usd;
  const yearlyInflationMlp = pInflationMlp * pPriceData.mycelium.usd;
  const apyFee = (yearlyFeeMlp / pTvl) * 100;
  const apyInflation = (yearlyInflationMlp / pTvl) * 100;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'mycelium.xyz',
    symbol: utils.formatSymbol('MLP'),
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens: [arbitrumMycAddress],
    underlyingTokens: [arbitrumMycAddress],
    underlyingTokens: [arbitrumMlpAddress],
  };
}

const getPools = async () => {
  let pools = [];

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=mycelium%2Cethereum&vs_currencies=usd'
  );

  const arbitrumStakedMyc = await getAdjustedAmount(
    arbitrumFeeMlpTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumStakedEsMyc = await getAdjustedAmount(
    arbitrumInflationMycTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumFeeMyc = await getAdjustedAmount(
    arbitrumFeeMlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  const arbitrumInflationMyc = await getAdjustedAmount(
    arbitrumInflationMycTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMyc(
      'arbitrum',
      arbitrumInflationMycTrackerAddress,
      arbitrumStakedMyc,
      arbitrumStakedEsMyc,
      arbitrumFeeMyc,
      arbitrumInflationMyc,
      priceData
    )
  );

  const arbitrumFeeMlp = await getAdjustedAmount(
    arbitrumFeeMlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  const arbitrumInflationMlp = await getAdjustedAmount(
    arbitrumInflationMlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMlp(
      'arbitrum',
      await getMlpTvl('arbitrum'),
      arbitrumInflationMlpTrackerAddress,
      arbitrumFeeMlp,
      arbitrumInflationMlp,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://swaps.mycelium.xyz/',
};
