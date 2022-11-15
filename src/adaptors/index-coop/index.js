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
  return {
    pool: `${index.address}-${chain}`.toLowerCase(),
    chain,
    project: 'index-coop',
    symbol: index.symbol,
    tvlUsd,
    apy,
  };
};

const getApy = async () => {
  const res = await superagent.get('https://api.indexcoop.com/iceth/apy');
  const json = JSON.parse(res.text);
  const apy = BigNumber(json.apy);
  return apy.div(1e18).toNumber();
};

const getPrice = async (index) => {
  const chain = utils.formatChain(index.chain);
  const key = `${chain}:${index.address}`.toLowerCase();
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;
  return ethPriceUSD;
};

const getSupply = async (address) => {
  const provider = getProvider();
  const contract = new ethers.Contract(address, SetTokenABI, provider);
  return await contract.totalSupply();
};

const getTvlUsd = async () => {
  const priceUsd = await getPrice(icEthIndex);
  const supply = await getSupply(icEthIndex.address);
  const supplyNumber = new BigNumber(supply.toString());
  const tvlUsd = supplyNumber.div(1e18).toNumber() * priceUsd;
  return tvlUsd;
};

const main = async () => {
  const apy = await getApy();
  const tvlUsd = await getTvlUsd();
  const icEth = buildPool(icEthIndex, apy, tvlUsd);
  return [icEth];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.indexcoop.com/products',
};
