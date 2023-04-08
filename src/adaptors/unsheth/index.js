const sdk = require('@defillama/sdk');
const axios = require('axios');
const ethers = require('ethers');
let cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
let darknetABI = require('./DarknetABI');
let lsdVaultABI = require('./LSDVaultABI');

const tokensToCheck = [
  "sfrxETH",
  "rETH",
  "wstETH",
  "cbETH"
];

let contract_addresses = {    
  "darknet": "0xe8ef2e07e2fca3305372cb0345c686efbec75658",
  "LSDVault": "0x51A80238B5738725128d3a3e06Ab41c1d4C05C74",

  "unshETH": "0x0Ae38f7E10A43B5b2fB064B42a2f4514cbA909ef",
  "USH": "0xe60779cc1b2c1d0580611c526a8df0e3f870ec48", 

  "USH-farm": "0xf728dB9182e7c3a9dFfbD71f9506d04f129Ac9C8",
  "unshETH-farm":"0x33890B88F98a9D511678954AD8DB0510B6953Cfc",  
  "sushi-farm": "0x5153b553d8ae3cbbb5ac97f5e4c8e5776d30ee09",

  "frxETH":"0xbafa44efe7901e04e39dad13167d089c559c1138",
  "WETH":"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",

  "sfrxETH": "0xac3e018457b222d93114458476f3e3416abbe38f",
  "rETH": "0xae78736cd615f374d3085123a210448e74fc6393",
  "wstETH":"0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  "cbETH": "0xbe9895146f7af43049ca1c1ae358b0541ea49704",
}

const getApy = async () => {
  let apyBase = await getWeightedApr();
  let tvlUsd = await getTVLUSD();

  return [
    {
      pool: `${contract_addresses['unshETH-farm']}-ethereum`,
      chain: 'ethereum',
      project: 'unsheth',
      symbol: 'unshETH',
      tvlUsd,
      apyBase,
      // apyReward: aprReward,
      rewardTokens: [contract_addresses.USH],
      underlyingTokens: [contract_addresses.WETH]
    },
  ];
};

async function getTVLUSD(){

  const priceKey = `ethereum:${contract_addresses.WETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;


  //get the darknet rate that converts each lsds into the respective amount of ETH
  let darknetRates = await getDarknetRates();

  //get the balances of each LSD in the LSD Vault Contract
  let lsdVaultTokenBalances = await getLSDVaultTokenBalances();

  //convert the balances to their eth amounts
  let lsdVaultEthBalances = {
    sfrxETH: parseFloat(lsdVaultTokenBalances.sfrxETH)/1e18 * parseFloat(darknetRates.sfrxETH)/1e18,
    cbETH: parseFloat(lsdVaultTokenBalances.cbETH)/1e18 * parseFloat(darknetRates.cbETH)/1e18,
    rETH: parseFloat(lsdVaultTokenBalances.rETH)/1e18 * parseFloat(darknetRates.rETH)/1e18,
    wstETH: parseFloat(lsdVaultTokenBalances.wstETH)/1e18 * parseFloat(darknetRates.wstETH)/1e18
  }

  //now get the total usd balance by multiplying each eth balance by the eth-usd price 
  let totalUsdBalance = 0;
  for (const [key, value] of Object.entries(lsdVaultEthBalances)) {
    totalUsdBalance += value * ethPrice;
  }

  let percentageOfUnshETHInFarm = await getPercentageOfUnshethInFarm();

  return totalUsdBalance*percentageOfUnshETHInFarm;
}

async function getPercentageOfUnshethInFarm(){
  let provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_CONNECTION_ETHEREUM);
  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)"
  ];

  //now get the total supply of unshETH and get the balance of unshETH in the unshETH farm using ethers
  let unshETHContract = new ethers.Contract(contract_addresses.unshETH, erc20Abi, provider);
  
  let unshETHFarmBalance = await unshETHContract.balanceOf(contract_addresses['unshETH-farm']);
  let unshETHFarmTotalSupply = await unshETHContract.totalSupply();

  //get the percentage of unshETH in the farm
  let percentageOfUnshETHInFarm = parseFloat(unshETHFarmBalance)/parseFloat(unshETHFarmTotalSupply);

  return percentageOfUnshETHInFarm;
}

async function getWeightedApr(){

  //get APRS of the underlying LSDs
  let underlyingAPR = {
    sfrxETH: (await axios.get('https://api.frax.finance/v2/frxeth/summary/latest')).data.sfrxethApr,
    cbETH: (await cbETHAdaptor.apy())[0].apyBase,
    rETH: parseFloat((await axios.get('https://api.rocketpool.net/api/apr')).data.yearlyAPR),
    wstETH: parseFloat((await axios.get('https://stake.lido.fi/api/sma-steth-apr')).data)
  }

  //get the darknet rate that converts each lsds into the respective amount of ETH
  let darknetRates = await getDarknetRates();

  //get the balances of each LSD in the LSD Vault Contract
  let lsdVaultTokenBalances = await getLSDVaultTokenBalances();

  //convert the balances to their eth amounts
  let lsdVaultEthBalances = {
    sfrxETH: parseFloat(lsdVaultTokenBalances.sfrxETH)/1e18 * parseFloat(darknetRates.sfrxETH)/1e18,
    cbETH: parseFloat(lsdVaultTokenBalances.cbETH)/1e18 * parseFloat(darknetRates.cbETH)/1e18,
    rETH: parseFloat(lsdVaultTokenBalances.rETH)/1e18 * parseFloat(darknetRates.rETH)/1e18,
    wstETH: parseFloat(lsdVaultTokenBalances.wstETH)/1e18 * parseFloat(darknetRates.wstETH)/1e18
  }

  //now calculate the weight of each lsd in the vault 
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

  //now multiply the apr of each lsd by its weight to get the weighted average apr
  let weightedApr = 0;
  for (let lsd in lsdVaultWeights) {
    weightedApr += underlyingAPR[lsd] * lsdVaultWeights[lsd];
  }

  return weightedApr;
}

//get the darknet rate that converts each lsds into the respective amount of ETH
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

  // Iterate through the tokens and get the balance in LSDVault
  for (const tokenKey of tokensToCheck) {
    const tokenAddress = contract_addresses[tokenKey];
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    balances[tokenKey]  = await tokenContract.balanceOf(contract_addresses.LSDVault);
  }

  return balances;
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://unsheth.xyz'
};

