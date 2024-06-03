const utils = require('../utils');
const bridgeInterestReceiverABI = require('./bridgeinterestreceiver');
const sdk = require('@defillama/sdk');

const chains = {
  xdai: {
    sDAI: '0xaf204776c7245bF4147c2612BF6e5972Ee483701',
    wxDAI: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    interestreceiver: '0x670daeaF0F1a5e336090504C68179670B5059088',
  }
};

async function getApy() {
    const vaultAPY = (
      await sdk.api.abi.call({
        chain: 'xdai',
        abi: bridgeInterestReceiverABI.find((m) => m.name === 'vaultAPY'),
        target: chains.xdai.interestreceiver,
      })
    ).output;
    return vaultAPY / 1e16;
}
async function getTVL() {
    // wxDAI balance of sDAI vault
    const tvl = (
      await sdk.api.abi.call({
        chain: 'xdai',
        abi: 'erc20:balanceOf',
        target: chains.xdai.wxDAI,
        params: chains.xdai.sDAI,
      })
    ).output;
    // get wxDAI price
    const wxDAIPrice = await utils.getPrices([chains.xdai.wxDAI], 'xdai');
    const tvlUSD = (tvl * wxDAIPrice.pricesBySymbol.wxdai) / 1e18;
    return tvlUSD;
}
async function sDAIPool() {
  const sDAIPoolData = {
    pool: chains.xdai.sDAI,
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
