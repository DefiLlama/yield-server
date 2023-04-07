const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const STAKING_ADDRESS = 'TGrdCu9fu8csFmQptVE25fDzFmPU9epamH';
const REVENUE_ADDRESS = 'TWisShDfhZGXLy1s5uoWjyyucSKwfkohu7';

const getCurrentStake = async () => {
  const postdata = {
    "contract_address": "414b8a2c619bccb710206b3d11e28dce62d8d72a8b",
    "owner_address": "4128fb7be6c95a27217e0e0bff42ca50cd9461cc9f",
    "function_selector": "reservedTRX()",
    "parameter": "",
    "call_value": 0
  };
  const result = await utils.getData('https://api.trongrid.io/wallet/triggerconstantcontract', postdata);
  return parseInt(result.constant_result[0], 16);
};

const getRevenueToday = async () => {
  const startTimestamp = Date.now() - 86400000; // 24 hours ago
  const url = `https://apilist.tronscan.org/api/transfer?sort=-timestamp&limit=20&start_timestamp=${startTimestamp}&token=_&address=${REVENUE_ADDRESS}`;
  let totalRevenue = 0;
  let startFrom = 0;
  while (true) {
    const { data } = await fetchURL(`${url}&start=${startFrom}`);
    const transfers = data.data;
    if (transfers.length === 0) {
      break;
    }
    totalRevenue += transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
    startFrom += 20; // start from next 20th element
  }
  return totalRevenue;
};

const poolsFunction = async () => {
  const [revenue, totalStake, dataTvl] = await Promise.all([
    getRevenueToday(),
    getCurrentStake(),
    utils.getData('https://api.llama.fi/tvl/strx-finance')
  ]);
  const dailyAPY = ((revenue / totalStake) * 365) * 100;
  return [{
    pool: STAKING_ADDRESS,
    chain: utils.formatChain('tron'),
    project: 'strx-finance',
    symbol: utils.formatSymbol('TRX'),
    tvlUsd: dataTvl,
    apyBase: dailyAPY > 0 ? Number(dailyAPY) : 0
  }];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: "https://app.strx.finance",
};
