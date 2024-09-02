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

const vault = '0xaf08a9d918f16332F22cf8Dc9ABE9D9E14DdcbC2';
const usdc = '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4';

const holdStaking = '0x7cF68AA037c67B6dae9814745345FFa9FC7075b1';
const hold = '0xed4040fD47629e7c8FBB7DA76bb50B3e7695F0f2';
const esHold = '0x671ceD60a5b4baEfD4FcaF15beD4DD1292FF14a0';

const provider = new ethers.providers.JsonRpcProvider(
  'https://mainnet.era.zksync.io'
);

const usdcPool = async () => {
  const currentTime = Math.trunc(Date.now() / 1000);

  const apy7dUrl = `https://api-trading.holdstation.com/api/apy/history/vault/time/${currentTime}?chainId=324`;
  const apy7d = await utils.getData(apy7dUrl);

  const apy24hUrl = `https://api-trading.holdstation.com/api/apy/history/vault-24h/time/${currentTime}?chainId=324`;
  const apyBase = await utils.getData(apy24hUrl);

  const usdcContract = new ethers.Contract(usdc, erc20Abi, provider);
  const usdcBalance = await usdcContract.balanceOf(vault);

  return {
    pool: `${vault}-zksync_era`,
    chain: 'zksync_era',
    project: 'holdstation-defutures',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcBalance / 1e6,
    apyBase7d: apy7d.rate,
    apyBase: apyBase.rate,

    // https://github.com/DefiLlama/yield-server/pull/1146#issuecomment-1895398250
    apyReward: parseFloat(apyBase.esHoldRate) * 0.5,
    
    underlyingTokens: [usdc],
    rewardTokens: [esHold],
  };
};

const holdPool = async () => {
  const currentTime = Math.trunc(Date.now() / 1000);

  const apy7dUrl = `https://gateway.holdstation.com/services/launchpad/api/hold-staking-vault/yield/time/${currentTime}`;
  const apy7d = await utils.getData(apy7dUrl);

  const apy24hUrl = `https://gateway.holdstation.com/services/launchpad/api/hold-staking-vault/yield-24h/time/${currentTime}`;
  const apyBase = await utils.getData(apy24hUrl);

  const holdContract = new ethers.Contract(hold, erc20Abi, provider);
  const balance = await holdContract.balanceOf(holdStaking);

  const coinResp = await axios.get(
    `https://coins.llama.fi/prices/current/coingecko:holdstation`
  );
  const coin = coinResp.data.coins['coingecko:holdstation'];

  return {
    pool: `${holdStaking}-zksync_era`,
    chain: 'zksync_era',
    project: 'holdstation-defutures',
    symbol: utils.formatSymbol(coin.symbol),
    tvlUsd: (balance / 1e18) * coin.price,
    apyBase7d: apy7d.baseRate,
    apyBase: apyBase.baseRate,

    // https://github.com/DefiLlama/yield-server/pull/1146#issuecomment-1895398250
    apyReward: apyBase.esHoldRate * 0.5,
    
    underlyingTokens: [hold],
    rewardTokens: [esHold],
  };
};

module.exports = {
  timetravel: true,
  apy: async () => {
    return [await usdcPool(), await holdPool()];
  },
  url: 'https://holdstation.exchange/vault',
};
