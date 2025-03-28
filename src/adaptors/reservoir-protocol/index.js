const sdk = require('@defillama/sdk');

const { default: BigNumber } = require('bignumber.js');

const BIG_10 = new BigNumber('10');
const utils = require('../utils');

const TOKEN = '0x738d1115B90efa71AE468F1287fc864775e23a31';
const TARGET = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';

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

    return [{
        pool: TARGET,
        symbol: 'srUSD',
        project: 'reservoir-protocol',
        chain: 'Ethereum',
        tvlUsd: (totalSupply / 10 ** 18) * price / 10 ** 8,
        apy: ((1 + rate / 10 ** 12) ** 365 - 1) * 100,
    }];
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://www.reservoir.xyz/',
};
