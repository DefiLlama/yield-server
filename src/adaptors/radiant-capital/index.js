const superagent = require('superagent');

const utils = require('../utils');
const pools = require('./pools.json');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');

const url = 'https://newapi4.radiant.capital/42161.json';

const sleep = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const apy = async (pools, dataTvl) => {
  const maxCallsPerSec = 5;
  let data = [];
  for (const [i, pool] of pools.entries()) {
    let x = dataTvl.find((el) => el.tokenAddress === pool.address);
    const output = (
      await sdk.api.abi.call({
        target: '0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F',
        abi: abi.find((a) => a.name === 'getReserveData'),
        chain: 'arbitrum',
        params: [pool.underlyingAsset],
      })
    ).output;
    let depositApy = output.currentLiquidityRate / 1e25;
    if ((i + 1) % maxCallsPerSec === 0) {
      await sleep(1000);
    }

    data.push({
      id: x.tokenAddress,
      symbol: pool.symbol,
      tvl: x.poolValue,
      depositApy,
      rewardApy: x.apy * 100,
    });
  }
  return data;
};

const padHex = (hexstring, intSize = 256) => {
  hexstring = hexstring.replace('0x', '');
  const length = intSize / 4 - hexstring.length;
  for (let i = 0; i < length; i++) {
    hexstring = '0' + hexstring;
  }
  return hexstring;
};

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'radiant-capital',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: entry.tvl,
    apy: entry.depositApy + entry.rewardApy,
  };

  return newObj;
};

const topLvl = async (chainString, url) => {
  // pull data
  const dataTvl = await utils.getData(url);

  // calculate apy
  let data = await apy(pools, dataTvl.lendingPoolRewards.data.poolAPRs);

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('arbitrum', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://radiant.capital/markets',
};
