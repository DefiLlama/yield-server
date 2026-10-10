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

// TokenController indexes from ITokenController.sol.
const DEPOSIT_L = 0;
const BORROW_L = 3;

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
const TOTAL_ASSETS_AND_SHARES_ABI =
  'function totalAssetsAndShares(bool withInterest) view returns (uint112[6] _allAssets, uint112[6] _allShares)';
const SWAP_EVENT =
  'event Swap(address indexed sender, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, address indexed to)';

const toBigInt = (amount) => BigInt(amount.toString());

const emptyTokenAmounts = () => ({ x: 0n, y: 0n });

const getArgs = (log) => log.args ?? log;

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

  return {
    x: toBigInt(output.reserveXAssets ?? output[0]),
    y: toBigInt(output.reserveYAssets ?? output[1]),
  };
};

const getAccountingAtBlock = async (pool, block) => {
  const { output } = await sdk.api.abi.call({
    target: pool.pair,
    abi: TOTAL_ASSETS_AND_SHARES_ABI,
    params: [true],
    chain: CHAIN,
    block,
  });
  const allAssets = output._allAssets ?? output[0];
  const allShares = output._allShares ?? output[1];

  return {
    depositLAssets: toBigInt(allAssets[DEPOSIT_L]),
    depositLShares: toBigInt(allShares[DEPOSIT_L]),
    borrowLAssets: toBigInt(allAssets[BORROW_L]),
  };
};

const getSwapVolume = async (pool, startBlock, endBlock) => {
  const volume = emptyTokenAmounts();
  const fromBlock = Math.max(startBlock, pool.fromBlock);
  if (endBlock < fromBlock) return volume;

  const logs = await sdk.getEventLogs({
    target: pool.pair,
    eventAbi: SWAP_EVENT,
    fromBlock,
    toBlock: endBlock,
    chain: CHAIN,
  });

  for (const log of logs) {
    const args = getArgs(log);
    volume.x += toBigInt(args.amountXIn);
    volume.y += toBigInt(args.amountYIn);
  }

  return volume;
};

const getWindow = (pool, startBlock, startTimestamp, endTimestamp) => ({
  startBlock: Math.max(startBlock, pool.fromBlock),
  elapsedDays:
    Math.max(0, endTimestamp - Math.max(startTimestamp, pool.fromTimestamp)) /
    SECONDS_PER_DAY,
});

const getPricePerShare = ({ depositLAssets, depositLShares }) => {
  if (depositLAssets <= 0n || depositLShares <= 0n) return null;
  return Number(depositLAssets) / Number(depositLShares);
};

const annualizeShareGrowth = (currentPrice, startPrice, elapsedDays) => {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(startPrice) ||
    currentPrice <= 0 ||
    startPrice <= 0 ||
    elapsedDays <= 0
  )
    return null;

  const apy =
    (Math.pow(currentPrice / startPrice, DAYS_PER_YEAR / elapsedDays) - 1) *
    100;
  return Number.isFinite(apy) ? apy : null;
};

const getTotalDepositedAmounts = (accounting, reserves) => {
  const activeLiquidityAssets =
    accounting.depositLAssets - accounting.borrowLAssets;
  if (activeLiquidityAssets <= 0n) return null;

  // The reserves represent active L. Scale them by total DEPOSIT_L / active L
  // so TVL also includes the underlying value of liquidity currently borrowed.
  return {
    x: (reserves.x * accounting.depositLAssets) / activeLiquidityAssets,
    y: (reserves.y * accounting.depositLAssets) / activeLiquidityAssets,
  };
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

  const dayWindow = getWindow(
    pool,
    blocks.dayStartBlock,
    timestamp - SECONDS_PER_DAY,
    timestamp
  );
  const weekWindow = getWindow(
    pool,
    blocks.weekStartBlock,
    timestamp - 7 * SECONDS_PER_DAY,
    timestamp
  );

  const [current, dayStart, weekStart, reserves, dailyVolume, weeklyVolume] =
    await Promise.all([
      getAccountingAtBlock(pool, blocks.endBlock),
      getAccountingAtBlock(pool, dayWindow.startBlock),
      getAccountingAtBlock(pool, weekWindow.startBlock),
      getReservesAtBlock(pool, blocks.endBlock),
      getSwapVolume(pool, dayWindow.startBlock, blocks.endBlock),
      getSwapVolume(pool, weekWindow.startBlock, blocks.endBlock),
    ]);

  const pricePerShare = getPricePerShare(current);
  const totalDepositedAmounts = getTotalDepositedAmounts(current, reserves);
  if (pricePerShare === null || totalDepositedAmounts === null) return null;

  return {
    pool: `${pool.pair}-${CHAIN}`,
    chain: DISPLAY_CHAIN,
    project: PROJECT,
    symbol: pool.tokens.map((token) => token.symbol).join('-'),
    tvlUsd: toUsd(totalDepositedAmounts, pool, prices),
    apyBase: annualizeShareGrowth(
      pricePerShare,
      getPricePerShare(dayStart),
      dayWindow.elapsedDays
    ),
    apyBase7d: annualizeShareGrowth(
      pricePerShare,
      getPricePerShare(weekStart),
      weekWindow.elapsedDays
    ),
    pricePerShare,
    underlyingTokens: pool.tokens.map((token) => token.address),
    token: pool.token,
    url: 'https://app.ammalgam.xyz/trade',
    volumeUsd1d: toUsd(dailyVolume, pool, prices),
    volumeUsd7d: toUsd(weeklyVolume, pool, prices),
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
