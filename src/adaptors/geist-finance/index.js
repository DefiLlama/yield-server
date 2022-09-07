const superagent = require('superagent');

const utils = require('../utils');
const pools = require('./pools.json');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');

const url = 'https://api.geist.finance/api/lendingPoolRewards';

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
        target: '0x9FAD24f572045c7869117160A571B2e50b10d068',
        abi: abi.find((a) => a.name === 'getReserveData'),
        chain: 'fantom',
        params: [x.underlyingAsset],
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
    project: 'geist-finance',
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
  let data = await apy(pools, dataTvl.data.poolAPRs);

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('fantom', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://geist.finance/markets',
};
