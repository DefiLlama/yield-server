const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const rSavingsRateAbi = require('./abis/RSavingsRate.json');

const RR = {
  ethereum: '0xd2c0c4A6296D416C5Eb6Ae41d17aC4Db4bDD5296',
  base: '0xA5b3FEe253f9DE67201dC8572Bd2CbB4a81c1bEc',
};

// R stablecoin addresses
const R_TOKEN = {
  ethereum: '0x183015a9ba6ff60230fdeadc3f43b3d788b13e21',
  base: '0xafb2820316e7bc5ef78d295ab9b8bb2257534576',
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
    underlyingTokens: [R_TOKEN[chain]],
  };
}

async function apy() {
  return Promise.all(['ethereum', 'base'].map(chainApy));
}

module.exports = {
  apy,
  url: 'https://app.raft.fi/savings',
};
