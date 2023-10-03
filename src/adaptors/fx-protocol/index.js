const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

const getPoolData = async () => {
  let aTokenData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/fx_rebalance_tvl_apy`
  );
  const { address: rebalancePool, tvl, apy } = aTokenData.data;
  const newObj = [
    {
      pool: `${rebalancePool}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fETH',
      tvlUsd: parseInt(tvl, 10),
      apy: parseFloat(apy),
    },
  ];
  return newObj;
};

const main = async () => {
  const data = await getPoolData();
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fx.aladdin.club/rebalance-pool/',
};
