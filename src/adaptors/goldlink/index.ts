const utils = require('../utils');
const sdk = require('@defillama/sdk');
const reserveAbi = require('./abis/reserve-abi.json');
const bankAbi = require('./abis/bank-abi.json');

const arbitrumReserveAddress = '0xd8dD54dF1A7d2EA022B983756d8a481Eea2a382a';
const arbitrumBankAddress = '0x479889160FEECe9C0fB0FDDF3b45312f54D719CC';

const arbAddress = '0x912CE59144191C1204E64559FE8253a0e49E6548';

const BONUS = 0.2;

async function getInterestRate() {
  const [model, balance, utilizedAssets, insurancePremium] = await Promise.all([
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: reserveAbi['model_'],
      chain: 'arbitrum',
    }),
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: reserveAbi['reserveBalance_'],
      chain: 'arbitrum',
    }),
    sdk.api.abi.call({
      target: arbitrumReserveAddress,
      abi: reserveAbi['utilizedAssets_'],
      chain: 'arbitrum',
    }),
    sdk.api.abi.call({
      target: arbitrumBankAddress,
      abi: bankAbi,
      chain: 'arbitrum',
    }),
  ]);

  const utilized = parseInt(utilizedAssets.output);
  const insuranceHaircut = parseInt(insurancePremium.output) / 1e18;
  console.log(insuranceHaircut);

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
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: total / 1e6,
    apyBase:
      (baseInterestRate + rateBelowOptimal + rateAboveOptimal) *
      100 *
      (1 - insuranceHaircut),
    apyReward: BONUS * 100,
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
