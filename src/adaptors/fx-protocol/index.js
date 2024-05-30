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
  const newObj = Object.keys(RebalancePoolData.data).map((item) => {
    const { name, underlyingTokens, rebalancePoolAddress, apy, tvl } =
      RebalancePoolData.data[item];

    const n = name.split('_');
    const symbol = n[0];
    const poolMeta = n.slice(1).join(' ');
    return {
      pool: `${rebalancePoolAddress}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol,
      poolMeta,
      tvlUsd: parseInt(tvl, 10),
      apy: parseFloat(apy),
      underlyingTokens: underlyingTokens,
    };
  });
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
