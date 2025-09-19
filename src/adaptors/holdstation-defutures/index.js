const utils = require('../utils');
const ethers = require('ethers');
const axios = require('axios');

const erc20Abi = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const vault = '0x7470C48FBf23067F6F8Ef63f7D9B4A2aA5D0afEf';
const usd1 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';

const provider = new ethers.providers.JsonRpcProvider(
  'https://binance.llamarpc.com'
);

const usd1Pool = async () => {
  const currentTime = Math.trunc(Date.now() / 1000);

  const apy7dUrl = `https://bnbfutures.holdstation.com/api/apy/history/vault/time/${currentTime}`;
  const apy7d = await utils.getData(apy7dUrl);

  const apy24hUrl = `https://bnbfutures.holdstation.com/api/apy/mUSDC`;
  const apyBase = await utils.getData(apy24hUrl);

  const usd1Contract = new ethers.Contract(usd1, erc20Abi, provider);
  const usd1Balance = await usd1Contract.balanceOf(vault);

  return {
    pool: `${vault}-binance`,
    chain: 'Binance',
    project: 'holdstation-defutures',
    symbol: utils.formatSymbol('USD1'),
    tvlUsd: usd1Balance / 1e18,
    apyBase7d: apy7d.rate,
    apyBase: apyBase.rate,

    underlyingTokens: [usd1],
  };
};

module.exports = {
  timetravel: true,
  apy: async () => {
    return [await usd1Pool()];
  },
  url: 'https://holdstation.exchange/vault',
};
