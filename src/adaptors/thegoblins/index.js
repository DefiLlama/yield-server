const utils = require('../utils');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const bankAbi = {
  inputs: [],
  name: 'getLastUpdatedModulesBalance',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

async function bankTvl() {
  const totalBalance = (
    await sdk.api.abi.call({
      abi: bankAbi,
      chain: 'arbitrum',
      target: '0xceF63C8507004a8d079daE3c83e369De0Adfa7Aa',
      params: [],
    })
  ).output;

  return totalBalance;
}

const poolsFunction = async () => {
  const bankApy = await utils.getData(
    'https://api.thegoblins.finance/aggregator/performance'
  );

  const key = 'arbitrum:0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
  const price = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;

  const tvl = await bankTvl();

  const bank = {
    pool: '0xceF63C8507004a8d079daE3c83e369De0Adfa7Aa',
    chain: utils.formatChain('arbitrum'),
    project: 'thegoblins',
    symbol: utils.formatSymbol('USDC.e'),
    tvlUsd: (tvl / 1e6) * price,
    apy: bankApy.last24hApy * 100,
    underlyingTokens: ['0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'],
  };

  return [bank];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://thegoblins.finance',
};
