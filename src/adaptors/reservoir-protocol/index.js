const sdk = require('@defillama/sdk');

const { default: BigNumber } = require('bignumber.js');

const BIG_10 = new BigNumber('10');
const utils = require('../utils');

const TOKEN = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const TARGET = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

const WSRUSD = '0xd3fD63209FA2D55B07A0f6db36C2f43900be3094';

const SAVING_MODULE = {
  abis: {
    currentRate: {
      inputs: [],
      name: 'currentRate',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    currentPrice: {
      inputs: [],
      name: 'currentPrice',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};


const WSRUSD_ABI = {
  abis: {
    currentRate: {
      inputs: [],
      name: 'currentRate',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    currentPrice: {
      inputs: [],
      name: 'currentPrice',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    convertToAssets: {
      inputs: [
        {
          name: 'shares',
          type: 'uint256',
          internalType: 'uint256'
        }
      ],
      name: 'convertToAssets',
      outputs: [
        {
          name: '',
          type: 'uint256',
          internalType: 'uint256'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    }
  }
};

const main = async () => {

  const totalSupply = (
    await sdk.api.abi.call({
      target: TOKEN,
      abi: 'erc20:totalSupply',
    })
  ).output;

  const rate = (
    await sdk.api.abi.call({
      target: TARGET,
      abi: SAVING_MODULE.abis.currentRate,
      chain: 'ethereum',
    })
  ).output;

  const price = (
    await sdk.api.abi.call({
      target: TARGET,
      abi: SAVING_MODULE.abis.currentPrice,
      chain: 'ethereum',
    })
  ).output;

  const totalSupplyW = (
    await sdk.api.abi.call({
      target: WSRUSD,
      abi: 'erc20:totalSupply',
    })
  ).output;

  const rateW = (
    await sdk.api.abi.call({
      target: WSRUSD,
      abi: WSRUSD_ABI.abis.currentRate,
      chain: 'ethereum',
    })
  ).output;

  const priceW = (
    await sdk.api.abi.call({
      target: WSRUSD,
      abi: 'function convertToAssets(uint256 shares) external view returns (uint256 assets)',
      params: [1000000000000000000n],
      chain: 'ethereum',
    })
  ).output;

  return [
    {
      pool: TARGET,
      symbol: 'srUSD',
      project: 'reservoir-protocol',
      chain: 'Ethereum',
      tvlUsd: (totalSupply / 10 ** 18) * price / 10 ** 8,
      apy: ((1 + rate / 10 ** 12) ** 365 - 1) * 100,
    },
    {
      pool: WSRUSD,
      symbol: 'wsrUSD',
      project: 'reservoir-protocol',
      chain: 'Ethereum',
      tvlUsd: (totalSupplyW / 10 ** 18) * priceW / 10 ** 18,
      apy: ((1 + rateW / 10 ** 27) ** 31557600 - 1) * 100,
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.reservoir.xyz/',
};
