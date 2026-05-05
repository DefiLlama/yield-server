const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const { config } = require('./config');
const BigNumber = require('bignumber.js');

// function getEstimatedAPR is misleading, it returns the estimated APY
const getEstimatedAPR =
  'function estimatedAPR() external view returns (uint256)';
const getTotalAssets = 'function totalAssets() external view returns (uint256)';

const getUSDmoData = async (chain, chainConfig) => {
  const { chainName, USDmo, sUSDmo } = chainConfig;
  let estimatedAPY;
  let totalAssets;
  const api = new sdk.ChainApi({ chain });
  [estimatedAPY, totalAssets] = await Promise.all([
    api.call({
      abi: getEstimatedAPR,
      target: sUSDmo,
    }),
    api.call({
      abi: getTotalAssets,
      target: sUSDmo,
    }),
  ]);

  const tvlUsd = new BigNumber(
    ethers.utils.formatUnits(totalAssets, 18)
  ).toNumber();
  const apyBase = new BigNumber(
    ethers.utils.formatUnits(estimatedAPY, 16)
  ).toNumber();

  return {
    pool: `${sUSDmo}-monet`.toLowerCase(),
    chain: utils.formatChain(chainName),
    project: 'monet',
    symbol: 'sUSDmo',
    tvlUsd: tvlUsd,
    apyBase: apyBase,
    rewardTokens: [USDmo],
    underlyingTokens: [USDmo],
    poolMeta: 'saving',
  };
};

const main = async () => {
  const markets = [];
  for (let [chain, data] of Object.entries(config)) {
    const result = await getUSDmoData(chain, data);
    markets.push(result);
  }
  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.monet.cash/earn',
};
