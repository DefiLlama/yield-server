const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const { ethers } = require('ethers');
const superagent = require('superagent');

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

const hyEthIndex = {
  address: '0xc4506022Fb8090774E8A628d5084EED61D9B99Ee',
  chain: 'Ethereum',
  symbol: 'hyETH',
};

const SetTokenABI = ['function totalSupply() external view returns (uint256)'];

const buildPool = async (index) => {
  try {
    const apy = await getApy(index.address);
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

const getApy = async (address) => {
  const res = await superagent.get(
    `https://api.indexcoop.com/v2/data/${address}?chainId=1&metrics=apy`
  );
  const json = JSON.parse(res.text);
  const { APY, Rate, StreamingFee } = json.metrics[0];
  return APY + Rate + StreamingFee;
};

const getPrice = async (index) => {
  const chain = utils.formatChain(index.chain);
  const key = `${chain}:${index.address}`.toLowerCase();
  const ethPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;
  return ethPriceUSD;
};

const getTvlUsd = async (index) => {
  const priceUsd = await getPrice(index);
  const supply = await sdk.api2.erc20.totalSupply({ target: index.address });
  const supplyNumber = new BigNumber(supply.output.toString());
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
