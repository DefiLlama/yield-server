const sdk = require('@defillama/sdk');
const utils = require('../utils');

const RewardsWrapper = require('./abis/RewardsWrapper.json');
const msUSD = require('./abis/msUSD.json');

const CHAIN_NAME = 'ethereum';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT = '0x890A5122Aa1dA30fEC4286DE7904Ff808F0bd74A';

const poolsFunction = async () => {
  const totalSupply = await sdk.api.abi
    .call({
      target: msUSD.address,
      abi: msUSD.abi.find((m) => m.name === 'totalSupply'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const apr = await sdk.api.abi
    .call({
      target: RewardsWrapper.address,
      abi: RewardsWrapper.abi.find((m) => m.name === 'getCurrentInterestRate'),
      params: [VAULT],
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const apy = (Math.pow(1 + apr / 1e18 / 365, 365) - 1) * 100;

  const msUSDPool = {
    pool: msUSD.address,
    chain: utils.formatChain('ethereum'),
    project: 'mainstreet',
    symbol: utils.formatSymbol('msUSD'),
    tvlUsd: Number(totalSupply) / 1e18,
    apyBase: apy,
    apyReward: 0,
    rewardTokens: [msUSD.address],
    underlyingTokens: [USDC],
    url: 'https://mainstreet.finance',
  };

  return [msUSDPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
