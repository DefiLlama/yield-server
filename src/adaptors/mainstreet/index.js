const sdk = require('@defillama/sdk');
const utils = require('../utils');

const RewardsWrapper = require('./abis/RewardsWrapper.json');
const msUSD = require('./abis/msUSD.json');

const CHAIN_NAME = 'sonic';
const USDC = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894';
const VAULT = '0xc7990369DA608C2F4903715E3bD22f2970536C29';

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

  const apy = (Math.pow(1 + (apr/1e18) / 365, 365) - 1) * 100;

  const msUSDPool = {
    pool: msUSD.address,
    chain: utils.formatChain('sonic'),
    project: 'mainstreet',
    symbol: utils.formatSymbol('msUSD'),
    tvlUsd: Number(totalSupply) / 1e18,
    apyBase: apy,
    apyReward: 0,
    rewardTokens: [msUSD.address],
    underlyingTokens: [USDC],
    url: 'https://mainstreet.finance',
  };

  return [msUSDPool]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};