const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const CommonAbi = require('./abis/Common.json');
const reBalanceAbi = require('./abis/reBalance.json');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

const getRebalancePoolData = async () => {
  let RebalancePoolData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/fx_rebalance_tvl_apy`
  );
  const {
    fETH_StabilityPool_wstETH,
    fETH_StabilityPool_xETH,
    fxUSD_StabilityPool_wstETH,
    fxUSD_StabilityPool_xstETH,
    fxUSD_StabilityPool_sfrxETH,
    fxUSD_StabilityPool_xfrxETH,
  } = RebalancePoolData.data;
  const newObj = [
    {
      pool: `${fETH_StabilityPool_wstETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fETH-stabilityPool-wstETH',
      tvlUsd: parseInt(fETH_StabilityPool_wstETH.tvl, 10),
      apy: parseFloat(fETH_StabilityPool_wstETH.apy),
    },
    {
      pool: `${fETH_StabilityPool_xETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fETH-stabilityPool-xETH',
      tvlUsd: parseInt(fETH_StabilityPool_xETH.tvl, 10),
      apy: parseFloat(fETH_StabilityPool_xETH.apy),
    },
    {
      pool: `${fxUSD_StabilityPool_wstETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fxUSD-stabilityPool-wstETH',
      tvlUsd: parseInt(fxUSD_StabilityPool_wstETH.tvl, 10),
      apy: parseFloat(fxUSD_StabilityPool_wstETH.apy),
    },
    {
      pool: `${fxUSD_StabilityPool_xstETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fxUSD-stabilityPool-xstETH',
      tvlUsd: parseInt(fxUSD_StabilityPool_xstETH.tvl, 10),
      apy: parseFloat(fxUSD_StabilityPool_xstETH.apy),
    },
    {
      pool: `${fxUSD_StabilityPool_sfrxETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fxUSD-stabilityPool-sfrxETH',
      tvlUsd: parseInt(fxUSD_StabilityPool_sfrxETH.tvl, 10),
      apy: parseFloat(fxUSD_StabilityPool_sfrxETH.apy),
    },
    {
      pool: `${fxUSD_StabilityPool_xfrxETH.rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fxUSD-stabilityPool-xfrxETH',
      tvlUsd: parseInt(fxUSD_StabilityPool_xfrxETH.tvl, 10),
      apy: parseFloat(fxUSD_StabilityPool_xfrxETH.apy),
    },
  ];
  return newObj;
};

const getGaugePoolData = async () => {
  let RebalancePoolData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/fx_gauge_tvl_apy`
  );
  const newObj = RebalancePoolData.data.map((data) => {
    const { gauge, name, tvl, apy } = data;
    return {
      pool: `${gauge}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: utils.formatSymbol(name),
      tvlUsd: parseInt(tvl, 10),
      apy: parseFloat(apy),
    };
  });

  return newObj;
};

const main = async () => {
  const rebalancedata = await getRebalancePoolData();
  const gaugeData = await getGaugePoolData();
  const data = [].concat(rebalancedata).concat(gaugeData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fx.aladdin.club/rebalance-pool/',
};
