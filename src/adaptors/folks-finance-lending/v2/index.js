const { getAppState, getParsedValueFromState } = require('../utils');
const { pools } = require('./constants');
const { getCachedPrices } = require('./prices');
const utils = require('../../utils');

function parseUint64s(base64Value) {
  const value = Buffer.from(base64Value, 'base64').toString('hex');

  // uint64s are 8 bytes each
  const uint64s = [];
  for (let i = 0; i < value.length; i += 16) {
    uint64s.push(BigInt('0x' + value.slice(i, i + 16)));
  }
  return uint64s;
}

async function retrievePoolInfo({ poolAppId, poolAssetId }) {
  const state = await getAppState(poolAppId);

  if (state === undefined)
    return {
      depositsUsd: 0,
      borrowsUsd: 0,
    };

  const prices = await getCachedPrices();
  const price = prices[poolAssetId];
  if (price === undefined) return { depositsUsd: 0, borrowsUsd: 0 };

  const varBor = parseUint64s(String(getParsedValueFromState(state, 'v')));
  const stblBor = parseUint64s(String(getParsedValueFromState(state, 's')));
  const interest = parseUint64s(String(getParsedValueFromState(state, 'i')));

  const variableBorrowAmountUsd = Number(varBor[3]) * price;
  const stableBorrowAmountUsd = Number(stblBor[8]) * price;
  const borrowsAmountUsd = variableBorrowAmountUsd + stableBorrowAmountUsd;
  const depositsAmountUsd = Number(interest[3]) * price;

  // combine
  return {
    depositsUsd: depositsAmountUsd,
    borrowsUsd: borrowsAmountUsd,
  };
}

async function getPoolsInfo(pool) {
  const poolInfo = await retrievePoolInfo({
    poolAppId: pool.appId,
    poolAssetId: pool.assetId,
  });
  return poolInfo;
}

/* Get  tvl */
async function tvl(pool) {
  const { depositsUsd, borrowsUsd } = await getPoolsInfo(pool);
  return depositsUsd - borrowsUsd;
}

/* Get  borrows */
async function borrow(pool) {
  const { borrowsUsd } = await getPoolsInfo(pool);
  return borrowsUsd;
}

/* Get  deposit */
async function deposit(pool) {
  const { depositsUsd } = await getPoolsInfo(pool);
  return depositsUsd;
}

const getApy = () => 1;

const poolsFunction = async () => {
  let poolArr = [];
  pools.forEach(async (pool) => {
    const data = {
      pool: `${pool.appId}-algorand`,
      chain: utils.formatChain('algorand'),
      project: 'folks-finance-lending',
      symbol: utils.formatSymbol(pool.symbol),
      tvlUsd: await tvl(pool),
      apy: getApy(pool.assetId),
      totalSupplyUsd: await deposit(pool),
      totalBorrowUsd: await borrow(pool),
    };
    poolArr.push(data);
  });
  return poolArr;
};

module.exports = {
  poolsFunction,
};
