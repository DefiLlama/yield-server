const utils = require('../utils');
const bridgeInterestReceiverABI = require('./bridgeinterestreceiver');
const erc20ABI = require('./erc20');
const Web3 = require('web3');

const chains = {
  xdai: {
    sDAI: '0xaf204776c7245bF4147c2612BF6e5972Ee483701',
    wxDAI: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    interestreceiver: '0x670daeaF0F1a5e336090504C68179670B5059088',
  },
};
let web3;
let bridgeInterestReceiver;
let wxDAI;

async function init() {
  try {
    web3 = new Web3(
      new Web3.providers.HttpProvider('https://rpc.gnosischain.com')
    );
    bridgeInterestReceiver = new web3.eth.Contract(
      bridgeInterestReceiverABI,
      chains.xdai.interestreceiver
    );
    wxDAI = new web3.eth.Contract(erc20ABI, chains.xdai.wxDAI);
  } catch (e) {
    console.log(e);
  }
}
async function getApy() {
  try {
    // call vaultAPY() from bridge interest receiver contract
    let vaultAPY = await bridgeInterestReceiver.methods.vaultAPY().call();
    // remain 8 decimals
    return Math.round(web3.utils.fromWei(vaultAPY) * 1e8) / 1e8;
  } catch (e) {
    console.log(e);
  }
}
async function getTVL() {
  try {
    // wxDAI balance of sDAI vault
    let tvl = await wxDAI.methods.balanceOf(chains.xdai.sDAI).call();
    // get wxDAI price from coingecko
    let wxDAIPrice = await utils.getData(
      'https://api.coingecko.com/api/v3/simple/price?ids=wrapped-xdai&vs_currencies=usd'
    );
    // convert into USD
    let tvlUSD = (tvl * wxDAIPrice['wrapped-xdai'].usd) / 1e18;
    return tvlUSD;
  } catch (e) {
    console.log(e);
  }
}
async function sDAIPool() {
  await init();
  const sDAIPoolData = {
    pool: chains.xdai.interestreceiver,
    chain: utils.formatChain('xdai'),
    project: 'sdai',
    symbol: 'sDAI',
    apy: await getApy(),
    tvlUsd: await getTVL(),
  };
  return [sDAIPoolData];
}
module.exports = {
  timetravel: false,
  apy: sDAIPool,
  url: 'https://agave.finance/sdai/',
};
