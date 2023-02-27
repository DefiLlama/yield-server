const utils = require('../utils');
const sdk = require('@defillama/sdk');
const superagent = require("superagent");

const ALPHA1_CONTRACT = '0xdE4133f0CFA1a61Ba94EC64b6fEde4acC1fE929E';
const ALPHA2_CONTRACT = '0x3C390b91Fc2f248E75Cd271e2dAbF7DcC955B1A3';

const abiAlpha1 = {
  inputs: [],
  name: 'totalBalance',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const abiAlpha2 = {
  inputs: [],
  name: 'getLastUpdatedModulesBalance',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

async function tvlAlpha1() {
  const totalBalance = (
      await sdk.api.abi.call({
        abi: abiAlpha1,
        chain: 'avax',
        target: ALPHA1_CONTRACT,
        params: [],
      })
  ).output;

  return totalBalance;
}

async function tvlAlpha2() {
  const totalBalance = (
      await sdk.api.abi.call({
        abi: abiAlpha2,
        chain: 'avax',
        target: ALPHA2_CONTRACT,
        params: [],
      })
  ).output;

  return totalBalance;
}

const poolsFunction = async () => {
  const alpha1ApyData = await utils.getData(
      'https://api.hedgefarm.workers.dev/alpha1/performance'
  );

  const alpha2ApyData = await utils.getData(
      'https://api.hedgefarm.workers.dev/alpha2/performance'
  );

  const btcbKey = 'avax:0x152b9d0fdc40c096757f570a51e494bd4b943e50';
  const btcbTokenPrice = (
      await superagent.post('https://coins.llama.fi/prices').send({
          coins: [btcbKey],
      })
  ).body.coins[btcbKey].price;

  const balanceAlpha1 = await tvlAlpha1();
  const balanceAlpha2 = await tvlAlpha2();

  const alpha1 = {
    pool: '0xdE4133f0CFA1a61Ba94EC64b6fEde4acC1fE929E',
    chain: utils.formatChain('avalanche'),
    project: 'hedgefarm',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: balanceAlpha1 / 1e6,
    apy: alpha1ApyData.averageApy * 100,
    poolMeta: '28 Days Lock-up',
  };

  const alpha2 = {
    pool: '0x3C390b91Fc2f248E75Cd271e2dAbF7DcC955B1A3',
    chain: utils.formatChain('avalanche'),
    project: 'hedgefarm',
    symbol: utils.formatSymbol('BTC.b'),
    tvlUsd: balanceAlpha2 / 1e8 * btcbTokenPrice,
    apy: alpha2ApyData.last24hApy * 100,
  };

  return [alpha1, alpha2];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://hedgefarm.finance',
};
