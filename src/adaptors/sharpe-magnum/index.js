const utils = require('../utils');
const axios = require('axios');
const ethers = require('ethers');

async function fetchSmaApr() {
  const url = 'https://eth-api.lido.fi/v1/protocol/steth/apr/sma';
  const response = await axios.get(url);
  return response.data.data.smaApr;
}

async function getCurrentUserBorrowRate(provider, vaultAddress) {
  //fetching borrow rate from morpho-aave lens contract
  const contract = new ethers.Contract("0x507fA343d0A90786d86C7cd885f5C49263A91FF4", ['function getCurrentUserBorrowRatePerYear(address _poolToken, address _user) external view returns (uint256)'], provider);

  const poolToken = '0x030bA81f1c18d280636F32af80b9AAd02Cf0854e';
  const rate = await contract.getCurrentUserBorrowRatePerYear(poolToken, vaultAddress);
    
  return rate;
}

async function apy(provider, vaultAddress) {
 
  const bRate = await getCurrentUserBorrowRate(provider, vaultAddress);
  //borrow rate is in ray (1E27)
  let brate = bRate.div(ethers.BigNumber.from(10).pow(17));
  let newBrate = parseFloat(brate.toString()) * 0.00000001;
  const sRate = await fetchSmaApr();

  const contract = new ethers.Contract(
    vaultAddress, 
    ['function vaultsLeverage() external view returns(uint8)'], 
    provider
  );

  const leverage = await contract.vaultsLeverage();

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

const getApy = async () => {
  const provider = ethers.getDefaultProvider();
  const vaultAddress = "0xfc85db895e070017ab9c84cb65b911d56b729ee9";
  const apyVal = await apy(provider, vaultAddress)

  const Eth = {
    pool: '0xfc85db895e070017ab9c84cb65b911d56b729ee9-ethereum',
    chain: utils.formatChain('Ethereum'),
    project: 'sharpe-magnum',
    symbol: utils.formatSymbol('ETH'),
    apy: apyVal,
  };

  return [Eth]; 
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dapp.sharpe.ai/vaults/1/StEth',
};