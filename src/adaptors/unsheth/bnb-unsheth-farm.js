const axios = require('axios');
const ethers = require('ethers');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const utils = require('../utils');
const { seconds_per_year, denomination, tokensToCheck, BINANCE_RPC_URL } = require('./constants');

const getPoolInfo = async () => {
  try {
    let apyBase = await getWeightedApr();
    let tvlUsd = await getTVLUSD();
  
    let usdRewardPerYear = await getUSDRewardPerYear();
    let apyReward = parseFloat(parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2));
  
    return {
        pool: `${contract_addresses['BNBunshETH-farm']}-${utils.formatChain('binance')}`,
        chain: utils.formatChain('binance'),
        project: 'unsheth',
        symbol: 'unshETH',
        tvlUsd,
        apyBase,
        apyReward,
        rewardTokens: [contract_addresses.BNBUSH],
        underlyingTokens: [contract_addresses.BNBETH]
    }
  }
  catch (e) {
    console.log(e);
    throw new Error(e);
  }
};

async function getUSDRewardPerYear(){

  let provider = new ethers.providers.JsonRpcProvider(BINANCE_RPC_URL);
  let farmContract = new ethers.Contract(contract_addresses["BNBunshETH-farm"], farmABI, provider);
  let baseRewardsPerSecond = (await farmContract.getAllRewardRates())[0];

  let rewardsPerSecond = (parseFloat(baseRewardsPerSecond)/denomination)

  let rewardsPerYear = rewardsPerSecond * seconds_per_year;

  let priceKey = `coingecko:unsheth`;
  let USHPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;
  

  let USDRewardPerYear = USHPrice * parseFloat(rewardsPerYear);

  return USDRewardPerYear;
}

async function getTVLUSD(){
  const priceKey = `ethereum:${contract_addresses.WETH}`;
  const ethPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

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
    sfrxETH: (await axios.get(`https://coins.llama.fi/prices/current/coingecko:${coingeckoIds.sfrxETH}`)).data.coins[`coingecko:${coingeckoIds.sfrxETH}`]?.price,
    rETH: (await axios.get(`https://coins.llama.fi/prices/current/coingecko:${coingeckoIds.rETH}`)).data.coins[`coingecko:${coingeckoIds.rETH}`]?.price,
    wstETH: (await axios.get(`https://coins.llama.fi/prices/current/coingecko:${coingeckoIds.wstETH}`)).data.coins[`coingecko:${coingeckoIds.wstETH}`]?.price,
    cbETH: (await axios.get(`https://coins.llama.fi/prices/current/coingecko:${coingeckoIds.cbETH}`)).data.coins[`coingecko:${coingeckoIds.cbETH}`]?.price,
  }

  return prices
}

async function getPercentageOfUnshethInFarm(){


  let provider = new ethers.providers.JsonRpcProvider(BINANCE_RPC_URL);
  let eth_provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);

  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
  ];

  let BNBunshETHContract = new ethers.Contract(contract_addresses.BNBunshETH, erc20Abi, provider);
  let BNBunshETHFarmBalance = await BNBunshETHContract.balanceOf(contract_addresses['BNBunshETH-farm']);
  
  let unshETHContract = new ethers.Contract(contract_addresses.unshETH, erc20Abi, eth_provider);
  let unshETHTotalSupply = await unshETHContract.totalSupply();

  let percentageOfUnshETHInFarm = parseFloat(BNBunshETHFarmBalance)/parseFloat(unshETHTotalSupply);

  return percentageOfUnshETHInFarm;
}

async function getWeightedApr(){

  let underlyingAPR = {
    sfrxETH: (await axios.get('https://api.frax.finance/v2/frxeth/summary/latest')).data.sfrxethApr,
    cbETH: (await cbETHAdaptor.apy())[0].apyBase,
    rETH: parseFloat((await axios.get('https://api.rocketpool.net/api/apr')).data.yearlyAPR),
    wstETH: parseFloat((await axios.get('https://stake.lido.fi/api/sma-steth-apr')).data.data.smaApr)
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
  const provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);
  let darknet = new ethers.Contract(contract_addresses.darknet, darknetABI, provider);
  let darknetRates = {
    sfrxETH: await darknet.checkPrice(...[contract_addresses.sfrxETH]),
    cbETH: await darknet.checkPrice(...[contract_addresses.cbETH]),
    rETH: await darknet.checkPrice(...[contract_addresses.rETH]),
    wstETH: await darknet.checkPrice(...[contract_addresses.wstETH])
  }

  return darknetRates;
}

async function getLSDVaultTokenBalances() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);
  const balances = {};
  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)"
  ];

  for (const tokenKey of tokensToCheck) {
    const tokenAddress = contract_addresses[tokenKey];
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    balances[tokenKey]  = await tokenContract.balanceOf(contract_addresses.LSDVault);
  }

  return balances;
}

module.exports = {
  getPoolInfo
};

