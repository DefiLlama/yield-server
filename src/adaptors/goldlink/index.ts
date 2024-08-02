const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abis/abi.json');

const arbitrumReserveAddress = '0xd8dD54dF1A7d2EA022B983756d8a481Eea2a382a';
const arbitrumGmxReaderAddress = '0x5Ca84c34a381434786738735265b9f3FD814b824';

const arbAddress = '0x912CE59144191C1204E64559FE8253a0e49E6548';

const BONUS = 0.2;

async function getInterestRate() {
  const [model, balance, utilizedAssets] = await Promise.all([
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: abi['model_'],
      chain: 'arbitrum',
    }),
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: abi['reserveBalance_'],
      chain: 'arbitrum',
    }),
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: abi['utilizedAssets_'],
      chain: 'arbitrum',
    }),
  ]);

  const utilized = parseInt(utilizedAssets.output);

  const [optimalUtilization, baseInterestRate, rateSlope1, rateSlope2] = [
    parseInt(model.output.optimalUtilization) / 1e18,
    parseInt(model.output.baseInterestRate) / 1e18,
    parseInt(model.output.rateSlope1) / 1e18,
    parseInt(model.output.rateSlope2) / 1e18,
  ];

  const total = parseInt(balance.output) + utilized;
  const utilization = utilized / total;

  const utilizationAboveOptimal =
    utilization > optimalUtilization ? utilization - optimalUtilization : 0;
  const utilizationBelowOptimal = utilization - utilizationAboveOptimal;

  const rateBelowOptimal = utilizationBelowOptimal * rateSlope1;
  const rateAboveOptimal = utilizationAboveOptimal * rateSlope2;

  return {
    pool: arbitrumReserveAddress,
    chain: 'arbitrum',
    project: 'goldlink',
    symbol: utils.formatSymbol('USD'),
    tvlUsd: total / 1e6,
    apyBase: baseInterestRate + rateBelowOptimal + rateAboveOptimal,
    apyReward: BONUS,
    rewardTokens: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831', arbAddress],
    underlyingTokens: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831'],
  };
}

async function getPools() {
  return [await getInterestRate()];
}

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.goldlink.io',
};
