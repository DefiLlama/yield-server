const axios = require('axios');
const sdk = require('@defillama/sdk');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const { seconds_per_year, denomination, tokensToCheck } = require('./constants');
const utils = require('../utils');

const CHAIN = 'ethereum';
const GET_ALL_REWARD_RATES_ABI = farmABI.find(
  (item) => item.type === 'function' && item.name === 'getAllRewardRates'
);
const CHECK_PRICE_ABI = darknetABI.find(
  (item) => item.type === 'function' && item.name === 'checkPrice'
);

const getPoolInfo = async () => {
  let apyBase = await getWeightedApr();
  let tvlUsd = await getTVLUSD();

  let usdRewardPerYear = await getUSDRewardPerYear();
  let apyReward = parseFloat(parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2));

  return {
      pool: `${contract_addresses['unshETH-farm']}-${utils.formatChain('ethereum')}`,
      chain: utils.formatChain('ethereum'),
      project: 'unsheth',
      symbol: 'unshETH',
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [contract_addresses.USH],
      underlyingTokens: [contract_addresses.WETH]
  }
};

async function getUSDRewardPerYear(){
  let baseRewardsPerSecond = (
    await sdk.api.abi.call({
      target: contract_addresses["unshETH-farm"],
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

  let darknetRates = await getDarknetRates();

  let lsdVaultTokenBalances = await getLSDVaultTokenBalances();

  let lsdPrices = await getLSDPrices();

  let lsdVaultUSDBalances = {
    sfrxETH: parseFloat(lsdVaultTokenBalances.sfrxETH)/denomination * lsdPrices.sfrxETH,
    cbETH: parseFloat(lsdVaultTokenBalances.cbETH)/denomination * lsdPrices.cbETH,
    rETH: parseFloat(lsdVaultTokenBalances.rETH)/denomination * lsdPrices.rETH,
    wstETH: parseFloat(lsdVaultTokenBalances.wstETH)/denomination * lsdPrices.wstETH
  }

  let totalUsdBalance = 0;
  for (const [key, value] of Object.entries(lsdVaultUSDBalances)) {
    totalUsdBalance += value;
  }

  let percentageOfUnshETHInFarm = await getPercentageOfUnshethInFarm();

  return totalUsdBalance*percentageOfUnshETHInFarm;
}

async function getLSDPrices() {
  const coingeckoIds = {
    sfrxETH: 'staked-frax-ether',
    rETH: 'rocket-pool-eth',
    wstETH: 'staked-ether',
    cbETH: 'coinbase-wrapped-staked-eth',
  };

  let prices = {
    sfrxETH: (await utils.getPriceApiData(`/prices/current/coingecko:${coingeckoIds.sfrxETH}`)).coins[`coingecko:${coingeckoIds.sfrxETH}`]?.price,
    rETH: (await utils.getPriceApiData(`/prices/current/coingecko:${coingeckoIds.rETH}`)).coins[`coingecko:${coingeckoIds.rETH}`]?.price,
    wstETH: (await utils.getPriceApiData(`/prices/current/coingecko:${coingeckoIds.wstETH}`)).coins[`coingecko:${coingeckoIds.wstETH}`]?.price,
    cbETH: (await utils.getPriceApiData(`/prices/current/coingecko:${coingeckoIds.cbETH}`)).coins[`coingecko:${coingeckoIds.cbETH}`]?.price,
  }

  return prices
}

async function getPercentageOfUnshethInFarm(){
  const [{ output: unshETHFarmBalance }, { output: unshETHTotalSupply }] =
    await Promise.all([
      sdk.api.abi.call({
        target: contract_addresses.unshETH,
        abi: 'erc20:balanceOf',
        params: [contract_addresses['unshETH-farm']],
        chain: CHAIN,
      }),
      sdk.api.abi.call({
        target: contract_addresses.unshETH,
        abi: 'erc20:totalSupply',
        chain: CHAIN,
      }),
    ]);

  let percentageOfUnshETHInFarm = parseFloat(unshETHFarmBalance)/parseFloat(unshETHTotalSupply);

  return percentageOfUnshETHInFarm;
}

async function getWeightedApr(){

  let underlyingAPR = {
    sfrxETH: (await axios.get('https://api.frax.finance/v2/frxeth/summary/latest')).data.sfrxethApr,
    cbETH: (await cbETHAdaptor.apy())[0].apyBase,
    rETH: parseFloat((await axios.get('https://api.rocketpool.net/api/apr')).data.yearlyAPR),
    wstETH: parseFloat((await axios.get('https://eth-api.lido.fi/v1/protocol/steth/apr/last')).data.data.apr)
  }

  let darknetRates = await getDarknetRates();

  let lsdVaultTokenBalances = await getLSDVaultTokenBalances();

  let lsdVaultEthBalances = {
    sfrxETH: parseFloat(lsdVaultTokenBalances.sfrxETH)/denomination * parseFloat(darknetRates.sfrxETH)/denomination,
    cbETH: parseFloat(lsdVaultTokenBalances.cbETH)/denomination * parseFloat(darknetRates.cbETH)/denomination,
    rETH: parseFloat(lsdVaultTokenBalances.rETH)/denomination * parseFloat(darknetRates.rETH)/denomination,
    wstETH: parseFloat(lsdVaultTokenBalances.wstETH)/denomination * parseFloat(darknetRates.wstETH)/denomination
  }

  let totalEthBalance = 0;
  for (let lsd in lsdVaultEthBalances) {
    totalEthBalance += lsdVaultEthBalances[lsd];
  }
  let lsdVaultWeights = {
    sfrxETH: lsdVaultEthBalances.sfrxETH/totalEthBalance,
    cbETH: lsdVaultEthBalances.cbETH/totalEthBalance,
    rETH: lsdVaultEthBalances.rETH/totalEthBalance,
    wstETH: lsdVaultEthBalances.wstETH/totalEthBalance
  }

  let weightedApr = 0;
  for (let lsd in lsdVaultWeights) {
    weightedApr += underlyingAPR[lsd] * lsdVaultWeights[lsd];
  }

  return weightedApr;
}

async function getDarknetRates() {
  const { output } = await sdk.api.abi.multiCall({
    target: contract_addresses.darknet,
    abi: CHECK_PRICE_ABI,
    calls: tokensToCheck.map((tokenKey) => ({
      params: [contract_addresses[tokenKey]],
    })),
    chain: CHAIN,
  });
  let darknetRates = Object.fromEntries(
    tokensToCheck.map((tokenKey, index) => [tokenKey, output[index].output])
  );

  return darknetRates;
}

async function getLSDVaultTokenBalances() {
  const { output } = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: tokensToCheck.map((tokenKey) => ({
      target: contract_addresses[tokenKey],
      params: [contract_addresses.LSDVault],
    })),
    chain: CHAIN,
  });
  const balances = Object.fromEntries(
    tokensToCheck.map((tokenKey, index) => [tokenKey, output[index].output])
  );

  return balances;
}

module.exports = {
  getPoolInfo
};
