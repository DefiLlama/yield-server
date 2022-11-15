const { default: BigNumber } = require('bignumber.js');
const { ethers } = require('ethers');
const superagent = require('superagent');

const { getProvider } = require('@defillama/sdk/build/general');
const utils = require('../utils');

const icEthIndex = {
  address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84',
  chain: 'Ethereum',
  symbol: 'icETH',
};

const SetTokenABI = ['function totalSupply() external view returns (uint256)'];

const buildPool = (index, apy, tvlUsd) => {
  const chain = utils.formatChain(index.chain);
  const symbol = utils.formatSymbol(index.symbol);
  return {
    pool: `${index.address}-${chain}`.toLowerCase(),
    chain,
    project: 'index-coop',
    symbol,
    tvlUsd,
    apy,
  };
};

const getPrice = async (index) => {
  const chain = utils.formatChain(index.chain);
  const key = `${chain}:${index.address}`;
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;
};

const getSupply = async (address) => {
  const provider = getProvider();
  const contract = new ethers.Contract(address, SetTokenABI, provider);
  return await contract.totalSupply();
};

const main = async () => {
  // Will only work from defillama.com domain (others can be requested)
  const { apy } = await utils.getData('https://api.indexcoop.com/iceth/apy');
  const apyNumber = BigNumber(apy).div(1e18).toNumber();

  const priceUsd = await getPrice(icEthIndex);
  const supply = await getSupply(icEthIndex.address);
  const supplyNumber = BigNumber(supply).div(1e18).toNumber();
  const tvlUsd = supplyNumber * priceUsd;

  const icEth = buildPool(icEthIndex, apyNumber, tvlUsd);
  return [icEth];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.indexcoop.com/products',
};
