const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');

const SECONDS_PER_DAY = 24 * 60 * 60;
const TRAILING_WINDOW_DAYS = 7;
const NAV_UPDATE_LOOKBACK_DAYS = 30;
const NAV_UPDATE_CONFIRMATION_BLOCKS = 120;

const blockRangePromises = new Map();

async function getBlockByEpoch(epochSecs, chain) {
  const data = await utils.getPriceApiData(`/block/${chain}/${epochSecs}`);
  return data.height;
}

function getNavUpdateBlockRange(chain) {
  if (!blockRangePromises.has(chain)) {
    const rangePromise = (async () => {
      const toTimestamp = Math.floor(Date.now() / 1000);
      const fromTimestamp =
        toTimestamp - NAV_UPDATE_LOOKBACK_DAYS * SECONDS_PER_DAY;
      const [fromBlock, toBlock] = await Promise.all([
        getBlockByEpoch(fromTimestamp, chain),
        getBlockByEpoch(toTimestamp, chain),
      ]);

      return {
        fromBlock,
        toBlock: Math.max(fromBlock, toBlock - NAV_UPDATE_CONFIRMATION_BLOCKS),
      };
    })();
    blockRangePromises.set(chain, rangePromise);
  }

  return blockRangePromises.get(chain);
}

function parseNavUpdates(logs) {
  return logs
    .map((log) => {
      const timestamp = Number(log.args?.timestamp ?? log.args?.[1]);
      const newNav = new BigNumber(
        (log.args?.newNAV ?? log.args?.[0] ?? 0).toString(),
      );

      return {
        blockNumber: Number(log.blockNumber),
        logIndex: Number(log.logIndex ?? log.index ?? 0),
        timestamp,
        newNav,
      };
    })
    .filter(
      (record) =>
        Number.isFinite(record.blockNumber) &&
        record.blockNumber > 0 &&
        Number.isFinite(record.timestamp) &&
        record.timestamp > 0 &&
        record.newNav.isFinite() &&
        record.newNav.gte(0),
    )
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        a.blockNumber - b.blockNumber ||
        a.logIndex - b.logIndex,
    );
}

async function getNavUpdates(navOracleAddress, chain) {
  const { fromBlock, toBlock } = await getNavUpdateBlockRange(chain);
  const logs = await sdk.getEventLogs({
    target: navOracleAddress,
    chain,
    fromBlock,
    toBlock,
    eventAbi: abi.navUpdated,
    entireLog: true,
  });

  return parseNavUpdates(logs);
}

function findClosestNavApyBaseline(records, asOfIndex, windowDays) {
  if (asOfIndex <= 0) return null;

  const targetTimestamp =
    records[asOfIndex].timestamp - windowDays * SECONDS_PER_DAY;
  let bestRecord = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < asOfIndex; i++) {
    const record = records[i];
    const diff = Math.abs(record.timestamp - targetTimestamp);
    if (
      diff < bestDiff ||
      (diff === bestDiff &&
        bestRecord &&
        record.timestamp < bestRecord.timestamp)
    ) {
      bestRecord = record;
      bestDiff = diff;
    }
  }

  return bestRecord;
}

function calculateShareValue(newNav, totalSupply, decimals) {
  const supply = new BigNumber(totalSupply);
  if (supply.lte(0)) return 0;

  const scale = new BigNumber(10).pow(decimals);
  return newNav
    .times(scale)
    .div(supply)
    .integerValue(BigNumber.ROUND_FLOOR)
    .div(scale)
    .toNumber();
}

function computeCompoundedApy(
  startShareValue,
  endShareValue,
  startTimestamp,
  endTimestamp,
) {
  const periodDays = (endTimestamp - startTimestamp) / SECONDS_PER_DAY;
  if (
    !Number.isFinite(startShareValue) ||
    !Number.isFinite(endShareValue) ||
    startShareValue <= 0 ||
    endShareValue <= 0 ||
    periodDays <= 0
  ) {
    return 0;
  }

  const apy =
    ((endShareValue / startShareValue) ** (365 / periodDays) - 1) * 100;
  return Number.isFinite(apy) ? apy : 0;
}

async function getShareValues(
  startRecord,
  endRecord,
  shareManagerAddress,
  chain,
) {
  const [
    startSupplyResult,
    endSupplyResult,
    startDecimalsResult,
    endDecimalsResult,
  ] = await Promise.all([
    sdk.api.abi.call({
      target: shareManagerAddress,
      abi: abi.totalSupply,
      chain,
      block: startRecord.blockNumber,
    }),
    sdk.api.abi.call({
      target: shareManagerAddress,
      abi: abi.totalSupply,
      chain,
      block: endRecord.blockNumber,
    }),
    sdk.api.abi.call({
      target: shareManagerAddress,
      abi: abi.decimals,
      chain,
      block: startRecord.blockNumber,
    }),
    sdk.api.abi.call({
      target: shareManagerAddress,
      abi: abi.decimals,
      chain,
      block: endRecord.blockNumber,
    }),
  ]);

  const startDecimals = Number(startDecimalsResult.output);
  const endDecimals = Number(endDecimalsResult.output);
  return {
    startShareValue: calculateShareValue(
      startRecord.newNav,
      startSupplyResult.output,
      startDecimals,
    ),
    endShareValue: calculateShareValue(
      endRecord.newNav,
      endSupplyResult.output,
      endDecimals,
    ),
  };
}

async function getApy7d(navOracleAddress, shareManagerAddress, chain) {
  const records = await getNavUpdates(navOracleAddress, chain);
  if (records.length < 2) return 0;

  const asOfIndex = records.length - 1;
  const endRecord = records[asOfIndex];
  const startRecord = findClosestNavApyBaseline(
    records,
    asOfIndex,
    TRAILING_WINDOW_DAYS,
  );
  if (!startRecord) return 0;

  const { startShareValue, endShareValue } = await getShareValues(
    startRecord,
    endRecord,
    shareManagerAddress,
    chain,
  );

  return computeCompoundedApy(
    startShareValue,
    endShareValue,
    startRecord.timestamp,
    endRecord.timestamp,
  );
}

module.exports = {
  calculateShareValue,
  computeCompoundedApy,
  findClosestNavApyBaseline,
  getBlockByEpoch,
  getApy7d,
  parseNavUpdates,
};
