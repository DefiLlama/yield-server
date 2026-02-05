const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const { ethers } = require('ethers');
const superagent = require('superagent');

const utils = require('../utils');

const chainId = {
  Ethereum: 1,
  Base: 8453,
};

const WETH_ETHEREUM = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WETH_BASE = '0x4200000000000000000000000000000000000006';
const wstETH_BASE = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452';

const dsEthIndex = {
  address: '0x341c05c0E9b33C0E38d64de76516b2Ce970bB3BE',
  chain: 'Ethereum',
  symbol: 'dsETH',
  underlying: WETH_ETHEREUM,
};

const icEthIndex = {
  address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84',
  chain: 'Ethereum',
  symbol: 'icETH',
  underlying: WETH_ETHEREUM,
};

const hyEthData = {
  address: '0xc4506022Fb8090774E8A628d5084EED61D9B99Ee',
  chain: 'Ethereum',
  symbol: 'hyETH',
  underlying: WETH_ETHEREUM,
};

const wstETH15xData = {
  address: '0xc8DF827157AdAf693FCb0c6f305610C28De739FD',
  chain: 'Base',
  symbol: 'wstETH15x',
  underlying: wstETH_BASE,
};

const SetTokenABI = ['function totalSupply() external view returns (uint256)'];

const buildPool = async (index) => {
  try {
    const apy = await getApy(index.address, chainId[index.chain]);
    const tvlUsd = await getTvlUsd(index);
    const chain = utils.formatChain(index.chain);
    return {
      pool: `${index.address}-${chain}`.toLowerCase(),
      chain,
      project: 'index-coop',
      symbol: index.symbol,
      tvlUsd,
      apy,
      underlyingTokens: [index.underlying],
    };
  } catch (err) {
    console.log(err);
  }
};

const getApy = async (address, chain) => {
  const res = await superagent.get(
    `https://api.indexcoop.com/v2/data/${address}?chainId=${chain}&metrics=apy`
  );
  const json = JSON.parse(res.text);
  const { APY } = json.metrics[0];
  return APY;
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
  const supply = await sdk.api2.erc20.totalSupply({
    target: index.address,
    chain: index.chain.toLowerCase(),
  });
  const supplyNumber = new BigNumber(supply.output.toString());
  const tvlUsd = supplyNumber.div(1e18).toNumber() * priceUsd;
  return tvlUsd;
};

const main = async () => {
  const hyETH = await buildPool(hyEthData);
  const icETH = await buildPool(icEthIndex);
  const wstETH15x = await buildPool(wstETH15xData);
  return [hyETH, icETH, wstETH15x];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.indexcoop.com',
};
