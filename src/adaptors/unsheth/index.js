const sdk = require('@defillama/sdk');
const axios = require('axios');
const ethers = require('ethers');
let cbETHAdaptor = require('../coinbase-wrapped-staked-eth');
let darknetABI = require('./DarknetABI');
let lsdVaultABI = require('./LSDVaultABI');
let farmABI = require('./FarmABI');
const unshETHFarm = require('./unsheth-farm');
const BNBunshETHFarm = require('./bnb-unsheth-farm');
const sushiFarm = require('./ush-weth-sushi');
const pancakeFarm = require('./ush-bnb-pancake');

const getApy = async () => {
  let unshETHPool = await unshETHFarm.getPoolInfo();
  let bnbUnshETHPool = await BNBunshETHFarm.getPoolInfo();
  let sushiPool = await sushiFarm.getPoolInfo();
  let pancakePool = await pancakeFarm.getPoolInfo();


  return [
    unshETHPool,
    bnbUnshETHPool,
    sushiPool,
    pancakePool
  ]
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://unsheth.xyz'
};

