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

    const liquidity = (
      await sdk.api.abi.call({
        target: pool.underlyingAsset,
        abi: 'erc20:balanceOf',
        chain: 'arbitrum',
        params: [pool.address],
      })
    ).output;

    const decimals = +(
      await sdk.api.abi.call({
        target: pool.underlyingAsset,
        abi: 'erc20:decimals',
        chain: 'arbitrum',
      })
    ).output;

    let depositApy = output.currentLiquidityRate / 1e25;
    if ((i + 1) % maxCallsPerSec === 0) {
      await sleep(1000);
    }

    data.push({
      ...pool,
      id: x.tokenAddress,
      symbol: pool.symbol,
      tvl: (liquidity / 10 ** decimals) * x.assetPrice,
      depositApy,
      rewardApy: x.apy * 100,
    });
  }
  return data;
};

const apyPool2 = async (pool2Info) => {
  const pool2 = "0xc963ef7d977ECb0Ab71d835C4cb1Bf737f28d010";

  return {
    address: pool2,
    id: pool2,
    symbol: "RDNT-ETH",
    underlyingAsset: "0x0c4681e6c0235179ec3d4f4fc4df3d14fdd96017",
    tvl: pool2Info.data.totalLpStakedUSD,
    rewardApy: pool2Info.data.apr * 100,
  };
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
    project: 'radiant',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: entry.tvl,
    apyBase: entry.depositApy,
    apyReward: entry.rewardApy,
    underlyingTokens: [entry.underlyingAsset],
    rewardTokens: [
      '0x0c4681e6c0235179ec3d4f4fc4df3d14fdd96017', //RNDT
    ],
  };

  return newObj;
};

const topLvl = async (chainString, url) => {
  // pull data
  const dataTvl = await utils.getData(url);

  // calculate apy
  let data = await apy(pools, dataTvl.lendingPoolRewards.data.poolAPRs);
  let pool2Data = await apyPool2(dataTvl.pool2Info);
  data.push(pool2Data);

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
  url: 'https://app.radiant.capital/#/markets',
};
