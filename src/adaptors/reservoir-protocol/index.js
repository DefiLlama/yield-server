const sdk = require('@defillama/sdk');

const { default: BigNumber } = require('bignumber.js');

const BIG_10 = new BigNumber('10');
const utils = require('../utils');

const TOKEN = '0x5475611Dffb8ef4d697Ae39df9395513b6E947d7';
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
  },
};

const main = async () => {
    const rate = (await sdk.api.abi.call({
        target: TOKEN,
        abi: SAVING_MODULE.abis.currentRate,
        chain: 'ethereum',
    })).output;

    return [{
        apy: (1 + rate / 10 ** 12) ** 365,
    }];
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://www.reservoir.xyz/',
};
