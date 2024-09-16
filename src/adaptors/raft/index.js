const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const rSavingsRateAbi = require('./abis/RSavingsRate.json');

const RR = {
  ethereum: '0xd2c0c4A6296D416C5Eb6Ae41d17aC4Db4bDD5296',
  base: '0xA5b3FEe253f9DE67201dC8572Bd2CbB4a81c1bEc',
};
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;

async function chainApy(chain) {
  const issuanceRate = await sdk.api.abi.call({
    target: RR[chain],
    chain,
    abi: rSavingsRateAbi.issuanceRate,
  });
  const totalAssets = await sdk.api.abi.call({
    target: RR[chain],
    chain,
    abi: rSavingsRateAbi.totalAssets,
  });

  const apy =
    100 *
    BigNumber(issuanceRate.output).times(SECONDS_PER_YEAR).div(1e18).toNumber();
  const tvlUsd = BigNumber(totalAssets.output).div(1e18).toNumber();

  return {
    pool: `${RR[chain]}-${chain}`.toLowerCase(),
    project: 'raft',
    symbol: 'R',
    chain: utils.formatChain(chain),
    poolMeta: 'R Savings Rate',
    apy,
    tvlUsd,
  };
}

async function apy() {
  return Promise.all(['ethereum', 'base'].map(chainApy));
}

module.exports = {
  apy,
  url: 'https://app.raft.fi/savings',
};
