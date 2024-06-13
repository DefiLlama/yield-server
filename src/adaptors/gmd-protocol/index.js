const axios = require('axios');
const { multicall } = require('./utils/contracts');
const PriceABI = require('./abis/PriceABI.json');
const ValutABI = require('./abis/ValutABI.json');
const ERC20ABI = require('./abis/ERC20ABI.json');
const GMDStakingABI = require('./abis/GMDStakingABI.json');
const IUniswapV3Pool = require('./abis/IUniswapV3Pool.json');
const getTokenContract = require('./utils/contracts');
const ethers = require('ethers');
const {
  BTC_ADDR,
  ETH_ADDR,
  PRICE_ADDR,
  USDC_ADDR,
  VAULT_ADDR,
  GMD_STAKING_ADDR,
  GMD_STAKING_ADDR2,
  GMD_ADDR,
  esGMD_ADDR,
} = require('./abis/address');

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;
const BLOCKS_IN_A_YEAR = SECONDS_PER_YEAR / 14;

const aprToApy = (interest, frequency = BLOCKS_IN_A_YEAR) =>
  ((1 + interest / 100 / frequency) ** frequency - 1) * 100;

const getData = async () => {
  const fee = 1 - 0.5 / 100;
  let calls = [
    { address: VAULT_ADDR, params: [0], name: 'poolInfo' },
    { address: VAULT_ADDR, params: [1], name: 'poolInfo' },
    { address: VAULT_ADDR, params: [2], name: 'poolInfo' },
  ];
  const poolInfomation = await multicall(ValutABI, calls);
  calls = [
    { address: PRICE_ADDR, params: [USDC_ADDR], name: 'getPrice' },
    { address: PRICE_ADDR, params: [ETH_ADDR], name: 'getPrice' },
    { address: PRICE_ADDR, params: [BTC_ADDR], name: 'getPrice' },
  ];
  const _prices = await multicall(PriceABI, calls);

  const pools = [
    {
      price: _prices ? _prices[0][0] / Math.pow(10, 30) : 0,
      apr: aprToApy(poolInfomation[0].APR / 100).toFixed(2),
      totalStaked: poolInfomation[0].totalStaked,
    },
    {
      price: _prices ? _prices[1][0] / Math.pow(10, 30) : 0,
      apr: aprToApy(poolInfomation[1].APR / 100).toFixed(2),
      totalStaked: poolInfomation[1].totalStaked,
    },
    {
      price: _prices ? _prices[2][0] / Math.pow(10, 30) : 0,
      apr: aprToApy(poolInfomation[2].APR / 100).toFixed(2),
      totalStaked: poolInfomation[2].totalStaked,
    },
  ];

  const apy = [
    {
      pool: '0x4A723DE8aF2be96292dA3F824a96bfA053d4aF66',
      chain: 'Arbitrum',
      project: 'gmd-protocol',
      symbol: 'USDC',
      tvlUsd: (pools[0].totalStaked * pools[0].price) / Math.pow(10, 18),
      apyBase: pools[0].apr * fee,
      underlyingTokens: [USDC_ADDR],
    },
    {
      pool: '0xc5182E92bf001baE7049c4496caD96662Db1A186',
      chain: 'Arbitrum',
      project: 'gmd-protocol',
      symbol: 'ETH',
      tvlUsd: (pools[1].totalStaked * pools[1].price) / Math.pow(10, 18),
      apyBase: pools[1].apr * fee,
      underlyingTokens: [ETH_ADDR],
    },
    {
      pool: '0xEffaE8eB4cA7db99e954adc060B736Db78928467',
      chain: 'Arbitrum',
      project: 'gmd-protocol',
      symbol: 'BTC',
      tvlUsd: (pools[2].totalStaked * pools[2].price) / Math.pow(10, 18),
      apyBase: pools[2].apr * fee,
      underlyingTokens: [BTC_ADDR],
    },
  ];
  return apy;
};

module.exports = {
  timetravel: false,
  apy: getData,
  url: 'https://gmdprotocol.com/',
};
