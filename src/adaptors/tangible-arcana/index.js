const sdk = require('@defillama/sdk');
const utils = require('../utils');

const RebaseManager = require('./abis/RebaseManager.json');
const PointsVault = require('./abis/PointsBoostingVault.json');
const arcUSD = require('./abis/arcUSD.json');
const USTB = require('./abis/USTB.json');

const CHAIN_NAME = 'real';

const poolsFunction = async () => {
  const totalSupply = await sdk.api.abi
    .call({
      target: arcUSD.address,
      abi: arcUSD.abi.find((m) => m.name === 'totalSupply'),
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

    const amountStaked = await sdk.api.abi
    .call({
      target: arcUSD.address,
      abi: arcUSD.abi.find((m) => m.name === 'balanceOf'),
      params: [PointsVault.address],
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const apr = await sdk.api.abi
    .call({
      target: RebaseManager.address,
      abi: RebaseManager.abi.find((m) => m.name === 'getCurrentInterestRate'),
      params: [arcUSD.address],
      chain: CHAIN_NAME,
    })
    .then((result) => result.output);

  const apy = (Math.pow(1 + (apr/1e18) / 365, 365) - 1);
  const ratio = (totalSupply-amountStaked)/totalSupply;
  const apy_given_staked = (apy/ratio)*1e2;

  const arcUSDPool = {
    pool: arcUSD.address,
    chain: utils.formatChain('real'),
    project: 'tangible-arcana',
    symbol: utils.formatSymbol('arcUSD'),
    tvlUsd: Number(totalSupply) / 1e18,
    apyBase: apy_given_staked,
    apyReward: 0,
    rewardTokens: [arcUSD.address],
    underlyingTokens: [USTB.address],
    url: 'https://arcana.finance',
  };

  return [arcUSDPool]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
