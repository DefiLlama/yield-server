const utils = require('../utils');
const axios = require('axios');
const ethers = require('ethers');
const {abi} = require("./ABI")
const {vaultAbi} = require("./vaultAbi")
const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');

async function fetchSmaApr() {
  const url = 'https://eth-api.lido.fi/v1/protocol/steth/apr/sma';
  const response = await axios.get(url);
  return response.data.data.smaApr;
}

async function getCurrentUserBorrowRate(vaultAddress) {

  const poolToken = '0x030bA81f1c18d280636F32af80b9AAd02Cf0854e';

  const rate = (
    await sdk.api.abi.call({
      target: "0x507fA343d0A90786d86C7cd885f5C49263A91FF4",
      chain: "ethereum",
      abi: abi.find((m) => m.name === 'getCurrentUserBorrowRatePerYear'),
      params : [ poolToken, vaultAddress]
    })
  ).output;
    
  return ethers.BigNumber.from(rate);
}

async function apy(vaultAddress) {
 
  const bRate = await getCurrentUserBorrowRate(vaultAddress);
  //borrow rate is in ray (1E27)
  let brate = bRate.div(ethers.BigNumber.from(10).pow(17));
  let newBrate = parseFloat(brate.toString()) * 0.00000001;
  const sRate = await fetchSmaApr();

  const leverage = (
    await sdk.api.abi.call({
      target: vaultAddress,
      chain: "ethereum",
      abi: vaultAbi.find((m) => m.name === 'vaultsLeverage')
    })
  ).output;

  // if vault working on 3x leverage
  if(leverage == 2){
    return (3.00 * sRate) - (2.00 * parseFloat(newBrate.toString()));
  }
  // if vault working on 2x leverage
  else if(leverage == 1){
    return (2.00 * sRate) - ( parseFloat(newBrate.toString()));
  }
  // if vault working on 1x leverage
  else{
    return sRate
  } 
  
}

async function getTVLInUSD(vaultAddress) {
  const tvl = (
    await sdk.api.abi.call({
      target: vaultAddress,
      chain: "ethereum",
      abi: vaultAbi.find((m) => m.name === 'getVaultsActualBalance')
    })
  ).output;

  const address = "ethereum:0x0000000000000000000000000000000000000000";
  const response = await fetch(`https://coins.llama.fi/prices/current/${address}`);
  const data = await response.json();
  const ethData = data.coins[address];
  if (!ethData) {
    throw new Error(`ETH data not found for address ${address}`);
  }
  const ethPrice = ethData.price;
  
  const tvlUSD = ethers.utils.formatEther(tvl) * ethPrice;
  
  return tvlUSD;
}

const getApy = async () => {
  const vaultAddress = "0xfc85db895e070017ab9c84cb65b911d56b729ee9";
  const apyVal = await apy(vaultAddress)
  const tvlUSD = await getTVLInUSD(vaultAddress);

  const Eth = {
    pool: '0xfc85db895e070017ab9c84cb65b911d56b729ee9-ethereum',
    chain: utils.formatChain('Ethereum'),
    project: 'sharpe-magnum',
    symbol: utils.formatSymbol('ETH'),
    tvlUsd : tvlUSD,
    apy: apyVal,
  };

  return [Eth]; 
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dapp.sharpe.ai/vaults/1/StEth',
};