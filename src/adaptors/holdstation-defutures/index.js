const utils = require('../utils');
const ethers = require('ethers');

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

const getTvl = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    'https://mainnet.era.zksync.io'
  );
  const usdcContract = new ethers.Contract(usdc, erc20Abi, provider);
  const balance = await usdcContract.balanceOf(vault);
  return balance / 1e6;
};

const poolsFunction = async () => {
  const currentTime = Math.trunc(Date.now() / 1000);

  const apy7dUrl = `https://api-trading.holdstation.com/api/apy/history/vault/time/${currentTime}?chainId=324`;
  const apy7d = await utils.getData(apy7dUrl);

  const apy24hUrl = `https://api-trading.holdstation.com/api/apy/history/vault-24h/time/${currentTime}?chainId=324`;
  const apyBase = await utils.getData(apy24hUrl);

  const tvl = await getTvl();

  const udscPool = {
    pool: '0xaf08a9d918f16332f22cf8dc9abe9d9e14ddcbc2-zksync_era',
    chain: utils.formatSymbol('zksync_era'),
    project: 'holdstation-defutures',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvl, // number representing current USD TVL in pool
    apyBase7d: apy7d.rate,
    apyBase: apyBase.rate,
    // rewardTokens: [usdc],
    underlyingTokens: [usdc],
  };

  return [udscPool];
};

module.exports = {
  timetravel: true,
  apy: poolsFunction,
  url: 'https://holdstation.exchange/vault',
};
