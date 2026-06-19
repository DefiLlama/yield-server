const sdk = require('@defillama/sdk');
const axios = require('axios');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const { seconds_per_year, denomination, tokensToCheck } = require('./constants');
const utils = require('../utils');
const { getLatestAPRPancake } = require('./pancakeBaseAPR');

const CHAIN = 'bsc';
const GET_ALL_REWARD_RATES_ABI = farmABI.find(
  (item) => item.type === 'function' && item.name === 'getAllRewardRates'
);
const TOTAL_LIQUIDITY_LOCKED_ABI = farmABI.find(
  (item) => item.type === 'function' && item.name === 'totalLiquidityLocked'
);

const getPoolInfo = async () => {
  const latestAPR = await getLatestAPRPancake();
  const apyBase = Number.isFinite(latestAPR) ? latestAPR : 0;

  let tvlUsd = await getTVLUSD();

  let usdRewardPerYear = await getUSDRewardPerYear();
  let apyReward = parseFloat(parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2));

  return {
      pool: `${contract_addresses['BNBpancake-farm']}-${utils.formatChain('binance')}`,
      chain: utils.formatChain('binance'),
      project: 'unsheth',
      symbol: 'USH-WBNB',
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [contract_addresses.BNBUSH],
      underlyingTokens: [contract_addresses['BNBpancakeSwapLP']],
      poolMeta: 'Pancakeswap LP'
  }
};

async function getUSDRewardPerYear(){
  let baseRewardsPerSecond = (
    await sdk.api.abi.call({
      target: contract_addresses["BNBpancake-farm"],
      abi: GET_ALL_REWARD_RATES_ABI,
      chain: CHAIN,
    })
  ).output[0];

  let rewardsPerSecond = (parseFloat(baseRewardsPerSecond)/denomination)

  let rewardsPerYear = rewardsPerSecond * seconds_per_year;

  let priceKey = `coingecko:unsheth`;
  let USHPrice = (await utils.getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;


  let USDRewardPerYear = USHPrice * parseFloat(rewardsPerYear);

  return USDRewardPerYear;
}

async function getTVLUSD(){
  const priceKey = `coingecko:binancecoin`;
  const bnbPrice = (await utils.getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  const [
    { output: totalSupply },
    { output: totalStaked },
    { output: wbnbBalance },
  ] = await Promise.all([
    sdk.api.abi.call({
      target: contract_addresses["BNBpancakeSwapLP"],
      abi: 'erc20:totalSupply',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: contract_addresses["BNBpancake-farm"],
      abi: TOTAL_LIQUIDITY_LOCKED_ABI,
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: contract_addresses.WBNB,
      abi: 'erc20:balanceOf',
      params: [contract_addresses["BNBpancakeSwapLP"]],
      chain: CHAIN,
    }),
  ]);

  let percentageStaked = (parseFloat(totalStaked)/denomination) / (parseFloat(totalSupply)/denomination);

  let totalBalanceUSDInPancake = (parseFloat(wbnbBalance)/denomination)*2*bnbPrice;

  let totalBalanceUSD = totalBalanceUSDInPancake * percentageStaked;

  return totalBalanceUSD;
}


module.exports = {
  getPoolInfo
};
