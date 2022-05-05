const superagent = require('superagent');

const utils = require('../utils');
const pools = require('./pools.json');

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
    let depositApy = await getDepositApy(x.underlyingAsset);
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

const getDepositApy = async (address) => {
  const lendingPoolContract = '0x9FAD24f572045c7869117160A571B2e50b10d068';
  const getReserveDataHash = '35ea6a75';
  address = padHex(address);

  const url =
    'https://api.ftmscan.com/api?module=proxy&action=eth_call&to=' +
    lendingPoolContract +
    '&data=0x' +
    getReserveDataHash +
    address +
    '&tag=latest&apikey=' +
    process.env.FANTOMSCAN;
  const response = await superagent(url);
  const data = response.body;
  const hexValue = data.result;

  // extract relevant deposit apy value only
  let x = hexValue.replace('0x', '');
  const bytes = 64;
  x = parseInt(x.slice(bytes * 3, bytes * 4), 16) / 1e25;

  return x;
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
};
