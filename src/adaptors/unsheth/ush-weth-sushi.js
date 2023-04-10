const sdk = require('@defillama/sdk');
const axios = require('axios');
const ethers = require('ethers');
const contract_addresses = require('./contract_addresses');
const cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
const darknetABI = require('./DarknetABI');
const lsdVaultABI = require('./LSDVaultABI');
const farmABI = require('./FarmABI');
const { seconds_per_year, denomination, tokensToCheck } = require('./constants');
const {getLatestAPRSushi} = require('./sushiBaseAPR');
const utils = require('../utils');

const getPoolInfo = async () => {
  const apyBase = await getLatestAPRSushi();

  let tvlUsd = await getTVLUSD();

  let usdRewardPerYear = await getUSDRewardPerYear();
  let apyReward = parseFloat(usdRewardPerYear / tvlUsd * 100).toFixed(2) ;

  return {
      pool: `${contract_addresses['sushi-farm']}-${utils.formatChain('ethereum')}`,
      chain: utils.formatChain('ethereum'),
      project: 'unsheth',
      symbol: 'SLP',
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: [contract_addresses.USH],
      underlyingTokens: [contract_addresses['sushiSwapLP']]
  }
};

async function getUSDRewardPerYear(){
  let provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);
  let farmContract = new ethers.Contract(contract_addresses["sushi-farm"], farmABI, provider);

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

  //erc20 abi for getting the total supply of the token
  const erc20ABI = [
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
  ];

  let provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);
  let sushiContract = new ethers.Contract(contract_addresses["sushiSwapLP"], erc20ABI, provider);
  let farmContract = new ethers.Contract(contract_addresses["sushi-farm"], farmABI, provider);
  let wethContract = new ethers.Contract(contract_addresses.WETH, erc20ABI, provider );
  
  let totalSupply = await sushiContract.totalSupply();

  let totalStaked = await farmContract.totalLiquidityLocked();

  let percentageStaked = (parseFloat(totalStaked)/denomination) / (parseFloat(totalSupply)/denomination);

  let wethBalance = await wethContract.balanceOf(contract_addresses["sushiSwapLP"]);

  let totalBalanceUSDInSushi = (parseFloat(wethBalance)/denomination)*2*ethPrice;

  let totalBalanceUSD = totalBalanceUSDInSushi * percentageStaked;

  return totalBalanceUSD;
}


module.exports = {
  getPoolInfo
};

