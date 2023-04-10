const sdk = require('@defillama/sdk');
const axios = require('axios');
const ethers = require('ethers');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const { seconds_per_year, denomination, tokensToCheck, BINANCE_RPC_URL } = require('./constants');
const utils = require('../utils');
const { getLatestAPRPancake } = require('./pancakeBaseAPR');

const getPoolInfo = async () => {
  const apyBase = await getLatestAPRPancake();

  let tvlUsd = await getTVLUSD();

  let usdRewardPerYear = await getUSDRewardPerYear();
  let apyReward = parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2) ;

  return {
      pool: `${contract_addresses['BNBpancake-farm']}-${utils.formatChain('binance')}`,
      chain: utils.formatChain('binance'),
      project: 'unsheth',
      symbol: 'Cake-LP',
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [contract_addresses.BNBUSH],
      underlyingTokens: [contract_addresses['BNBpancakeSwapLP']]
  }
};

async function getUSDRewardPerYear(){
  let provider = new ethers.providers.JsonRpcProvider(BINANCE_RPC_URL);
  let farmContract = new ethers.Contract(contract_addresses["BNBpancake-farm"], farmABI, provider);

  let baseRewardsPerSecond = (await farmContract.getAllRewardRates())[0];

  let rewardsPerSecond = (parseFloat(baseRewardsPerSecond)/denomination)

  let rewardsPerYear = rewardsPerSecond * seconds_per_year;

  let priceKey = `coingecko:unsheth`;
  let USHPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;
  

  let USDRewardPerYear = USHPrice * parseFloat(rewardsPerYear);

  return USDRewardPerYear;
}

async function getTVLUSD(){
  const priceKey = `coingecko:binancecoin`;
  const bnbPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

  //erc20 abi for getting the total supply of the token
  const erc20ABI = [
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
  ];

  let provider = new ethers.providers.JsonRpcProvider(BINANCE_RPC_URL);
  let pancakeContract = new ethers.Contract(contract_addresses["BNBpancakeSwapLP"], erc20ABI, provider);
  let farmContract = new ethers.Contract(contract_addresses["BNBpancake-farm"], farmABI, provider);
  let wbnbContract = new ethers.Contract(contract_addresses.WBNB, erc20ABI, provider );
  
  let totalSupply = await pancakeContract.totalSupply();

  let totalStaked = await farmContract.totalLiquidityLocked();

  let percentageStaked = (parseFloat(totalStaked)/denomination) / (parseFloat(totalSupply)/denomination);

  let wbnbBalance = await wbnbContract.balanceOf(contract_addresses["BNBpancakeSwapLP"]);

  let totalBalanceUSDInPancake = (parseFloat(wbnbBalance)/denomination)*2*bnbPrice;

  let totalBalanceUSD = totalBalanceUSDInPancake * percentageStaked;

  return totalBalanceUSD;
}


module.exports = {
  getPoolInfo
};

