const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');

async function getBlockByEpoch(epochSecs, chain) {
  const data = await utils.getData(
    `https://coins.llama.fi/block/${chain}/${epochSecs}`,
  );
  return data.height;
}

async function getPPSAtBlock(
  navOracleAddress,
  shareManagerAddress,
  block,
  chain,
) {
  const [navResult, supplyResult] = await Promise.all([
    sdk.api.abi.call({
      target: navOracleAddress,
      abi: abi.getNAV,
      chain,
      block,
    }),
    sdk.api.abi.call({
      target: shareManagerAddress,
      abi: abi.totalSupply,
      chain,
      block,
    }),
  ]);

  const nav = new BigNumber(navResult.output);
  const supply = new BigNumber(supplyResult.output);

  if (supply.isZero()) {
    return new BigNumber(0);
  }

  return nav.times(1e18).div(supply);
}

async function calcApy(
  navOracleAddress,
  shareManagerAddress,
  startEpochSecs,
  endEpochSecs,
  intervalDays,
  chain,
) {
  const startBlock = await getBlockByEpoch(startEpochSecs, chain);
  const endBlock = await getBlockByEpoch(endEpochSecs, chain);

  let startPPS;
  try {
    startPPS = await getPPSAtBlock(
      navOracleAddress,
      shareManagerAddress,
      startBlock,
      chain,
    );
  } catch (e) {
    console.error(
      `Liminal: Unable to get start PPS for ${shareManagerAddress} at block ${startBlock}:`,
      e.message,
    );
    return 0;
  }

  if (startPPS.isZero()) {
    return 0;
  }

  const endPPS = await getPPSAtBlock(
    navOracleAddress,
    shareManagerAddress,
    endBlock,
    chain,
  );

  if (endPPS.isZero()) {
    return 0;
  }

  const yieldRatio = endPPS.minus(startPPS).div(startPPS);
  const apy = yieldRatio.times(365).div(intervalDays).times(100).toNumber();

  return Number.isNaN(apy) || apy < 0 ? 0 : apy;
}

function utcToday() {
  const dateString = new Date().toISOString().split('T')[0];
  return new Date(`${dateString}T00:00:00.000Z`);
}

function utcEndOfYesterday() {
  const today = utcToday();
  return new Date(today.getTime() - 1000);
}

async function getApy(navOracleAddress, shareManagerAddress, chain) {
  const yesterday = utcEndOfYesterday();
  const start = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(
    navOracleAddress,
    shareManagerAddress,
    startEpoch,
    yesterdayEpoch,
    1,
    chain,
  );
}

async function getApy7d(navOracleAddress, shareManagerAddress, chain) {
  const interval = 7;
  const yesterday = utcEndOfYesterday();
  const start = new Date(
    yesterday.getTime() - (interval - 1) * 24 * 60 * 60 * 1000,
  );

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(
    navOracleAddress,
    shareManagerAddress,
    startEpoch,
    yesterdayEpoch,
    interval,
    chain,
  );
}

module.exports = {
  getBlockByEpoch,
  getPPSAtBlock,
  calcApy,
  getApy,
  getApy7d,
};
