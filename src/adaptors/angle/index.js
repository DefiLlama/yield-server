const { AppStream } = require('aws-sdk');
const utils = require('../utils');

const networks = {
  1: 'Ethereum',
  137: 'Polygon',
};

let apyData;
const getPoolsData = async () => {
  const apyData = await utils.getData('https://api.angle.money//v1/incentives');

  const result = [];
  for (const staking of Object.keys(apyData)) {
    if (apyData[staking].deprecated) continue;
    // the identifier is the voting gauge address and not the address of the staking pool
    const pool = {
      pool: apyData[staking]?.address, // address of the staking pool
      chain: networks[apyData[staking]?.network] || 'Other',
      project: 'angle',
      symbol: apyData[staking]?.name,
      tvlUSD: apyData[staking]?.tvl,
      apy: apyData[staking]['apr']?.value,
    };
    result.push(pool);
  }

  return result;
};

module.exports = {
  timetravel: false,
  apy: getPoolsData,
};
