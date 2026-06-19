const sdk = require('@defillama/sdk');
const axios = require('axios');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const { seconds_per_year, denomination, tokensToCheck } = require('./constants');
const {getLatestAPRSushi} = require('./sushiBaseAPR');
const utils = require('../utils');

const CHAIN = 'ethereum';
const GET_ALL_REWARD_RATES_ABI = farmABI.find(
  (item) => item.type === 'function' && item.name === 'getAllRewardRates'
);
const TOTAL_LIQUIDITY_LOCKED_ABI = farmABI.find(
  (item) => item.type === 'function' && item.name === 'totalLiquidityLocked'
);

const getPoolInfo = async () => {
  const latestAPR = await getLatestAPRSushi();
  const apyBase = Number.isFinite(latestAPR) ? latestAPR : 0;

  let tvlUsd = await getTVLUSD();

  let usdRewardPerYear = await getUSDRewardPerYear();
  let apyReward = parseFloat(parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2));

  return {
      pool: `${contract_addresses['sushi-farm']}-${utils.formatChain('ethereum')}`,
      chain: utils.formatChain('ethereum'),
      project: 'unsheth',
      symbol: 'USH-WETH',
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [contract_addresses.USH],
      underlyingTokens: [contract_addresses['sushiSwapLP']],
      poolMeta: 'Sushiswap LP'
  }
};

async function getUSDRewardPerYear(){
  let baseRewardsPerSecond = (
    await sdk.api.abi.call({
      target: contract_addresses["sushi-farm"],
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
  const priceKey = `ethereum:${contract_addresses.WETH}`;
  const ethPrice = (await utils.getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  const [
    { output: totalSupply },
    { output: totalStaked },
    { output: wethBalance },
  ] = await Promise.all([
    sdk.api.abi.call({
      target: contract_addresses["sushiSwapLP"],
      abi: 'erc20:totalSupply',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: contract_addresses["sushi-farm"],
      abi: TOTAL_LIQUIDITY_LOCKED_ABI,
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: contract_addresses.WETH,
      abi: 'erc20:balanceOf',
      params: [contract_addresses["sushiSwapLP"]],
      chain: CHAIN,
    }),
  ]);

  let percentageStaked = (parseFloat(totalStaked)/denomination) / (parseFloat(totalSupply)/denomination);

  let totalBalanceUSDInSushi = (parseFloat(wethBalance)/denomination)*2*ethPrice;

  let totalBalanceUSD = totalBalanceUSDInSushi * percentageStaked;

  return totalBalanceUSD;
}


module.exports = {
  getPoolInfo
};
