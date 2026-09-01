const sdk = require('@defillama/sdk');
const {
  utils: { formatUnits },
} = require('ethers');
const utils = require('../utils');

const PROJECT = 'ammalgam-dlex';
const CHAIN = 'ethereum';
const DISPLAY_CHAIN = utils.formatChain(CHAIN);
const SECONDS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;

const token = (symbol, address, decimals) => ({
  symbol,
  address: address.toLowerCase(),
  decimals,
});

const USDC = token('USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6);
const USDT = token('USDT', '0xdac17f958d2ee523a2206206994597c13d831ec7', 6);
const WETH = token('WETH', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18);

const TOKENS = [USDC, USDT, WETH];
const POOLS = [
  {
    pair: '0x728fd0a966b993fe518b00122d51e494f99abd6a',
    fromBlock: 25481998,
    fromTimestamp: 1783443275,
    token: '0x72d015e116a965ed022c57dbc18a91f0bd329b65',
    tokens: [USDC, WETH],
  },
  {
    pair: '0xf53d16bc876212ae501cccc1949d73bb55be4b0e',
    fromBlock: 25843244,
    fromTimestamp: 1787793803,
    token: '0xb2e1c416b97613a30a69c5b12ec369d8e986d5ac',
    tokens: [USDC, USDT],
  },
].map((pool) => ({
  ...pool,
  pair: pool.pair.toLowerCase(),
  token: pool.token.toLowerCase(),
}));

const PRICE_KEYS = TOKENS.map((token) => `${CHAIN}:${token.address}`);

const GET_RESERVES_ABI =
  'function getReserves() view returns (uint112 reserveXAssets, uint112 reserveYAssets, uint32 lastTimestamp)';
const SWAP_EVENT =
  'event Swap(address indexed sender, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, address indexed to)';
const SYNC_EVENT = 'event Sync(uint256 reserveXAssets, uint256 reserveYAssets)';
const INTEREST_ACCRUED_EVENT =
  'event InterestAccrued(uint256 reserveXAssets, uint256 reserveYAssets, uint112 depositXAssets, uint112 depositYAssets, uint112 borrowLAssets, uint112 borrowXAssets, uint112 borrowYAssets)';

const toBigInt = (amount) => BigInt(amount.toString());

const ceilDiv = (numerator, denominator) =>
  (numerator + denominator - 1n) / denominator;

const amountInForNoFeeSwap = (reserveIn, reserveOut, amountOut) => {
  if (amountOut === 0n) return 0n;
  if (reserveIn === 0n || reserveOut <= amountOut) return null;

  return ceilDiv(reserveIn * amountOut, reserveOut - amountOut);
};

const getReserveState = (reserves) => ({
  reserveXAssets: toBigInt(reserves.reserveXAssets ?? reserves[0]),
  reserveYAssets: toBigInt(reserves.reserveYAssets ?? reserves[1]),
});

const emptyReserveState = () => ({
  reserveXAssets: 0n,
  reserveYAssets: 0n,
});

const emptyTokenAmounts = () => ({
  x: 0n,
  y: 0n,
});

const emptyWindowYield = (elapsedDays = 0) => ({
  fees: emptyTokenAmounts(),
  borrowInterest: emptyTokenAmounts(),
  volume: emptyTokenAmounts(),
  elapsedDays,
});

const getArgs = (log) => log.args ?? log;
const getLogIndex = (log) => Number(log.logIndex ?? log.index ?? 0);

const sortEvents = (a, b) =>
  Number(a.blockNumber) - Number(b.blockNumber) ||
  getLogIndex(a) - getLogIndex(b);

const calculateSwapFee = ({ reserves, log }) => {
  const amountXIn = toBigInt(log.amountXIn);
  const amountYIn = toBigInt(log.amountYIn);
  const amountXOut = toBigInt(log.amountXOut ?? 0);
  const amountYOut = toBigInt(log.amountYOut ?? 0);
  let feeX = 0n;
  let feeY = 0n;

  if (amountXIn > 0n && amountYOut > 0n) {
    const noFeeAmountXIn = amountInForNoFeeSwap(
      reserves.reserveXAssets,
      reserves.reserveYAssets,
      amountYOut
    );
    if (noFeeAmountXIn !== null && amountXIn > noFeeAmountXIn)
      feeX = amountXIn - noFeeAmountXIn;
  }

  if (amountYIn > 0n && amountXOut > 0n) {
    const noFeeAmountYIn = amountInForNoFeeSwap(
      reserves.reserveYAssets,
      reserves.reserveXAssets,
      amountXOut
    );
    if (noFeeAmountYIn !== null && amountYIn > noFeeAmountYIn)
      feeY = amountYIn - noFeeAmountYIn;
  }

  return { feeX, feeY };
};

const calculateBorrowInterest = ({ reserves, log }) => {
  const updatedReserveXAssets = toBigInt(log.reserveXAssets);
  const updatedReserveYAssets = toBigInt(log.reserveYAssets);

  return {
    interestXForLP:
      updatedReserveXAssets > reserves.reserveXAssets
        ? updatedReserveXAssets - reserves.reserveXAssets
        : 0n,
    interestYForLP:
      updatedReserveYAssets > reserves.reserveYAssets
        ? updatedReserveYAssets - reserves.reserveYAssets
        : 0n,
  };
};

const updateReservesFromSwap = (reserves, log) => {
  reserves.reserveXAssets =
    reserves.reserveXAssets +
    toBigInt(log.amountXIn) -
    toBigInt(log.amountXOut ?? 0);
  reserves.reserveYAssets =
    reserves.reserveYAssets +
    toBigInt(log.amountYIn) -
    toBigInt(log.amountYOut ?? 0);
};

const updateReservesFromInterestAccrued = (reserves, log) => {
  reserves.reserveXAssets = toBigInt(log.reserveXAssets);
  reserves.reserveYAssets = toBigInt(log.reserveYAssets);
};

const addSwapVolume = (volume, log) => {
  volume.x += toBigInt(log.amountXIn);
  volume.y += toBigInt(log.amountYIn);
};

const normalizeTimestamp = (timestamp) =>
  timestamp === null || timestamp === undefined
    ? Math.floor(Date.now() / 1000)
    : Number(timestamp);

const getHistoricalPrices = async (timestamp) => {
  const { coins } = await utils.getPriceApiData(
    `/prices/historical/${timestamp}/${PRICE_KEYS.join(',').toLowerCase()}`
  );

  return TOKENS.reduce((prices, token) => {
    const price = coins[`${CHAIN}:${token.address}`]?.price;
    if (!Number.isFinite(price))
      throw new Error(`Missing historical ${token.symbol} price`);

    prices[token.address] = price;
    return prices;
  }, {});
};

const getBlocks = async (timestamp) => {
  const [weekStartBlock, dayStartBlock, endBlock] = await utils.getBlocksByTime(
    [timestamp - 7 * SECONDS_PER_DAY, timestamp - SECONDS_PER_DAY, timestamp],
    CHAIN
  );

  return { weekStartBlock, dayStartBlock, endBlock };
};

const getReservesAtBlock = async (pool, block) => {
  const { output } = await sdk.api.abi.call({
    target: pool.pair,
    abi: GET_RESERVES_ABI,
    chain: CHAIN,
    block,
  });

  return getReserveState(output);
};

const getBalancesAtBlock = async (pool, block) => {
  const { output } = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: pool.tokens.map((token) => ({
      target: token.address,
      params: [pool.pair],
    })),
    chain: CHAIN,
    block,
  });

  return {
    x: toBigInt(output[0].output),
    y: toBigInt(output[1].output),
  };
};

const getWindowLogs = async (pool, startBlock, endBlock) => {
  const [swapLogs, syncLogs, interestLogs] = await Promise.all([
    sdk.getEventLogs({
      target: pool.pair,
      eventAbi: SWAP_EVENT,
      fromBlock: startBlock,
      toBlock: endBlock,
      chain: CHAIN,
    }),
    sdk.getEventLogs({
      target: pool.pair,
      eventAbi: SYNC_EVENT,
      fromBlock: startBlock,
      toBlock: endBlock,
      chain: CHAIN,
    }),
    sdk.getEventLogs({
      target: pool.pair,
      eventAbi: INTEREST_ACCRUED_EVENT,
      fromBlock: startBlock,
      toBlock: endBlock,
      chain: CHAIN,
    }),
  ]);

  return [
    ...swapLogs.map((log) => ({ type: 'swap', ...log })),
    ...syncLogs.map((log) => ({ type: 'sync', ...log })),
    ...interestLogs.map((log) => ({ type: 'interest', ...log })),
  ].sort(sortEvents);
};

const calculateWindowYield = async (
  pool,
  startBlock,
  endBlock,
  startTimestamp,
  endTimestamp
) => {
  const elapsedDays =
    Math.max(0, endTimestamp - Math.max(startTimestamp, pool.fromTimestamp)) /
    SECONDS_PER_DAY;
  const yieldData = emptyWindowYield(elapsedDays);

  if (endBlock < pool.fromBlock || elapsedDays === 0) return yieldData;

  const logStartBlock = Math.max(startBlock, pool.fromBlock);
  const seedBlock = logStartBlock > pool.fromBlock ? logStartBlock - 1 : null;
  const reserves =
    seedBlock === null
      ? emptyReserveState()
      : await getReservesAtBlock(pool, seedBlock);
  const events = await getWindowLogs(pool, logStartBlock, endBlock);

  for (const event of events) {
    const args = getArgs(event);

    if (event.type === 'interest') {
      const { interestXForLP, interestYForLP } = calculateBorrowInterest({
        reserves,
        log: args,
      });
      yieldData.borrowInterest.x += interestXForLP;
      yieldData.borrowInterest.y += interestYForLP;
      updateReservesFromInterestAccrued(reserves, args);
      continue;
    }

    if (event.type === 'sync') {
      reserves.reserveXAssets = toBigInt(args.reserveXAssets);
      reserves.reserveYAssets = toBigInt(args.reserveYAssets);
      continue;
    }

    const { feeX, feeY } = calculateSwapFee({ reserves, log: args });
    yieldData.fees.x += feeX;
    yieldData.fees.y += feeY;
    addSwapVolume(yieldData.volume, args);
    updateReservesFromSwap(reserves, args);
  }

  return yieldData;
};

const toTokenAmount = (amount, decimals) =>
  Number(formatUnits(amount.toString(), decimals));

const toUsd = (amounts, pool, prices) =>
  pool.tokens.reduce((total, token, index) => {
    const amount = index === 0 ? amounts.x : amounts.y;
    return (
      total + toTokenAmount(amount, token.decimals) * prices[token.address]
    );
  }, 0);

const buildPool = async (pool, blocks, prices, timestamp) => {
  if (blocks.endBlock < pool.fromBlock) return null;

  const [reserves, balances, dailyYield, weeklyYield] = await Promise.all([
    getReservesAtBlock(pool, blocks.endBlock),
    getBalancesAtBlock(pool, blocks.endBlock),
    calculateWindowYield(
      pool,
      blocks.dayStartBlock,
      blocks.endBlock,
      timestamp - SECONDS_PER_DAY,
      timestamp
    ),
    calculateWindowYield(
      pool,
      blocks.weekStartBlock,
      blocks.endBlock,
      timestamp - 7 * SECONDS_PER_DAY,
      timestamp
    ),
  ]);
  const reservesUsd = toUsd(
    { x: reserves.reserveXAssets, y: reserves.reserveYAssets },
    pool,
    prices
  );
  const tvlUsd = toUsd(balances, pool, prices);
  const dailyYieldUsd = toUsd(
    {
      x: dailyYield.fees.x + dailyYield.borrowInterest.x,
      y: dailyYield.fees.y + dailyYield.borrowInterest.y,
    },
    pool,
    prices
  );
  const weeklyYieldUsd = toUsd(
    {
      x: weeklyYield.fees.x + weeklyYield.borrowInterest.x,
      y: weeklyYield.fees.y + weeklyYield.borrowInterest.y,
    },
    pool,
    prices
  );

  return {
    pool: `${pool.pair}-${CHAIN}`,
    chain: DISPLAY_CHAIN,
    project: PROJECT,
    symbol: pool.tokens.map((token) => token.symbol).join('-'),
    tvlUsd,
    apyBase:
      reservesUsd > 0 && dailyYield.elapsedDays > 0
        ? (dailyYieldUsd / reservesUsd) *
          (DAYS_PER_YEAR / dailyYield.elapsedDays) *
          100
        : null,
    apyBase7d:
      reservesUsd > 0 && weeklyYield.elapsedDays > 0
        ? (weeklyYieldUsd / reservesUsd) *
          (DAYS_PER_YEAR / weeklyYield.elapsedDays) *
          100
        : null,
    underlyingTokens: pool.tokens.map((token) => token.address),
    token: pool.token,
    url: 'https://app.ammalgam.xyz/trade',
    volumeUsd1d: toUsd(dailyYield.volume, pool, prices),
    volumeUsd7d: toUsd(weeklyYield.volume, pool, prices),
  };
};

const apy = async (timestampArg = null) => {
  const timestamp = normalizeTimestamp(timestampArg);
  const [blocks, prices] = await Promise.all([
    getBlocks(timestamp),
    getHistoricalPrices(timestamp),
  ]);
  const poolResults = await Promise.allSettled(
    POOLS.map((pool) => buildPool(pool, blocks, prices, timestamp))
  );

  return poolResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter(Boolean)
    .filter((pool) => utils.keepFinite(pool));
};

module.exports = {
  protocolId: '8278',
  timetravel: true,
  apy,
  url: 'https://app.ammalgam.xyz/trade',
};
