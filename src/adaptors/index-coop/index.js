const { default: BigNumber } = require('bignumber.js');
const { ethers } = require('ethers');
const superagent = require('superagent');

const { getProvider } = require('@defillama/sdk/build/general');
const utils = require('../utils');

const dsEthIndex = {
  address: '0x341c05c0E9b33C0E38d64de76516b2Ce970bB3BE',
  chain: 'Ethereum',
  symbol: 'dsETH',
};

const icEthIndex = {
  address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84',
  chain: 'Ethereum',
  symbol: 'icETH',
};

const SetTokenABI = ['function totalSupply() external view returns (uint256)'];

const buildPool = async (index) => {
  try {
    const apy = await getApy(index.symbol);
    const tvlUsd = await getTvlUsd(index);
    const chain = utils.formatChain(index.chain);
    return {
      pool: `${index.address}-${chain}`.toLowerCase(),
      chain,
      project: 'index-coop',
      symbol: index.symbol,
      tvlUsd,
      apy,
    };
  } catch (err) {
    console.log(err);
  }
};

const getApy = async (indexSymbol) => {
  const indexPath = indexSymbol.toLowerCase();
  const res = await superagent.get(
    `https://api.indexcoop.com/${indexPath}/apy`
  );
  const json = JSON.parse(res.text);
  const apy = BigNumber(json.apy);
  return apy.div(1e18).toNumber();
};

const getPrice = async (index) => {
  const chain = utils.formatChain(index.chain);
  const key = `${chain}:${index.address}`.toLowerCase();
  const ethPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;
  return ethPriceUSD;
};

const getSupply = async (address) => {
  const provider = getProvider();
  const contract = new ethers.Contract(address, SetTokenABI, provider);
  return await contract.totalSupply();
};

const getTvlUsd = async (index) => {
  const priceUsd = await getPrice(index);
  const supply = await getSupply(index.address);
  const supplyNumber = new BigNumber(supply.toString());
  const tvlUsd = supplyNumber.div(1e18).toNumber() * priceUsd;
  return tvlUsd;
};

const main = async () => {
  // const dsEth = await buildPool(dsEthIndex);
  // const icEth = await buildPool(icEthIndex);
  // return [dsEth, icEth].filter((i) => Boolean(i));
  const icETH = await buildPool(icEthIndex);
  return [icETH];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.indexcoop.com/products',
};
