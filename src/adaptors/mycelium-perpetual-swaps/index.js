const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { ethers } = require('ethers');

const convertToBigNumberWithDecimals = (balance) =>
  ethers.BigNumber.from(balance);

const arbitrumMyc = '0xc74fe4c715510ec2f8c61d70d397b32043f55abe';
const arbitrumEsMyc = '0x7CEC785fba5ee648B48FBffc378d74C8671BB3cb';
const arbitrumMlp = '0x752b746426b6D0c3188bb530660374f92FD9cf7c';
const arbitrumMlpManager = '0x2DE28AB4827112Cd3F89E5353Ca5A8D80dB7018f';
const arbitrumFeeMycTracker = '0x0cA0147c21F9DB9D4627e6a996342A11D25972C5';
const arbitrumInflationMycTracker =
  '0x2BC8E28f5d41a4b112BC62EB7Db1B757c85f37Ff';
const arbitrumFeeMlpTracker = '0xF0BFB95087E611897096982c33B6934C8aBfA083';
const arbitrumInflationMlpTracker =
  '0xF7Bd2ed13BEf9C27a2188f541Dc5ED85C5325306';
const arbitrumMycStaking = '0xF9B003Ee160dA9677115Ad3c5bd6BB6dADcB2F93';

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const CHAIN_STRING = 'arbitrum';
const MYC_TOKEN_DECIMALS = 18;

const projectSlug = 'mycelium-perpetual-swaps';

const getAdjustedAmount = async (pTarget, pAbi, pParams = []) => {
  const decimals = await sdk.api.abi.call({
    target: pTarget,
    abi: 'erc20:decimals',
    chain: CHAIN_STRING,
  });
  const supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: CHAIN_STRING,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval']
    ? supply.output * 10 ** -decimals.output * SECONDS_PER_YEAR
    : supply.output * 10 ** -decimals.output;
};

const getMlpTvl = async () => {
  const tvl = await sdk.api.abi.call({
    target: arbitrumMlpManager,
    abi: abi['getAumInUsdg'],
    chain: CHAIN_STRING,
    params: [false],
  });

  return tvl.output * 10 ** -18;
};

const getStakingApr = async (pPriceData) => {
  const tokensPerInterval = await sdk.api.abi.call({
    target: arbitrumMycStaking,
    abi: abi['tokensPerInterval'],
    chain: CHAIN_STRING,
  });

  const amountMycStaked = await sdk.api.abi.call({
    target: arbitrumMycStaking,
    abi: abi['totalDepositSupply'],
    chain: CHAIN_STRING,
    params: [arbitrumMyc],
  });

  const amountEsMycStaked = await sdk.api.abi.call({
    target: arbitrumMycStaking,
    abi: abi['totalDepositSupply'],
    chain: CHAIN_STRING,
    params: [arbitrumEsMyc],
  });

  const ethUsdPrice = pPriceData.ethereum.usd;
  const mycUsdPrice = pPriceData.mycelium.usd;

  const tokensPerIntervalBN = ethers.BigNumber.from(tokensPerInterval.output);
  const amountMycStakedBN = ethers.BigNumber.from(amountMycStaked.output);
  const amountEsMycStakedBN = ethers.BigNumber.from(amountEsMycStaked.output);

  const totalDepositTokens = amountMycStakedBN.add(amountEsMycStakedBN);
  const annualRewardsUsd = tokensPerIntervalBN
    .mul(SECONDS_PER_YEAR)
    .mul(ethers.utils.parseEther(ethUsdPrice.toString()));
  const totalDepositUsd = totalDepositTokens.mul(
    ethers.utils.parseEther(mycUsdPrice.toString())
  );
  const apr = (annualRewardsUsd / totalDepositUsd) * 100;
  return apr;
};

const getStakingTvl = async () => {
  const totalStaked = await sdk.api.abi.call({
    target: arbitrumMycStaking,
    abi: abi['totalSupply'],
    chain: CHAIN_STRING,
  });

  const totalAssetsBN = ethers.BigNumber.from(totalStaked.output);

  return totalAssetsBN * 10 ** -18;
};

const getPoolMlp = async (
  pTvl,
  pInflationTracker,
  pFeeMlp,
  pInflationMlp,
  pPriceData
) => {
  const yearlyFeeMlp = pFeeMlp * pPriceData.ethereum.usd;
  const yearlyInflationMlp = pInflationMlp * pPriceData.mycelium.usd;
  const apyFee = (yearlyFeeMlp / pTvl) * 100;
  const apyInflation = (yearlyInflationMlp / pTvl) * 100;

  return {
    pool: pInflationTracker,
    chain: utils.formatChain(CHAIN_STRING),
    project: projectSlug,
    symbol: utils.formatSymbol('MLP'),
    tvlUsd: parseFloat(pTvl),
    apyBase: apyFee,
    apyReward: apyInflation,
    rewardTokens: [arbitrumMyc],
    underlyingTokens: [arbitrumMyc],
    underlyingTokens: [arbitrumMlp],
  };
};

const getPoolMyc = async (pTvl, pApy, pStaking, pPriceData) => {
  return {
    pool: pStaking,
    chain: utils.formatChain(CHAIN_STRING),
    project: projectSlug,
    symbol: utils.formatSymbol('MYC'),
    tvlUsd: pTvl * pPriceData.mycelium.usd,
    apyBase: pApy,
    rewardTokens: [arbitrumMyc],
    underlyingTokens: [arbitrumMyc],
    underlyingTokens: [arbitrumMlp],
  };
};

const getPools = async () => {
  const pools = [];

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=mycelium%2Cethereum&vs_currencies=usd'
  );

  const arbitrumFeeMlp = await getAdjustedAmount(
    arbitrumFeeMlpTracker,
    abi['tokensPerInterval']
  );
  const arbitrumInflationMlp = await getAdjustedAmount(
    arbitrumInflationMlpTracker,
    abi['tokensPerInterval']
  );
  pools.push(
    await getPoolMlp(
      await getMlpTvl(),
      arbitrumInflationMlpTracker,
      arbitrumFeeMlp,
      arbitrumInflationMlp,
      priceData
    )
  );

  pools.push(
    await getPoolMyc(
      await getStakingTvl(),
      await getStakingApr(priceData),
      arbitrumMycStaking,
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
