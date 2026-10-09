const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'btr';
const CHAIN = 'monad';
const DISPLAY_CHAIN = 'Monad';
const FACTORY = '0xbbbbbbbbbd5e955E20F323cA1F95f8191fD0E0BF';
const SECONDS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;

// BTR DEX (AIMM) - adaptive inventory market maker. Each pool leg (base + spokes) has its own
// ERC-20 receipt (`Pool.lpToken(token)`). A leg's **liquid** economic balance for a leg is
// `Pool.getBuffer(token).reserves - .invested` (hook-invested tranches are pushed to external
// venues such as Euler/Aave, which DefiLlama lists separately; counting them here would double
// count them). A leg's LP fees accrue on the output side of swaps: the `Swapped` event packs
// `protoFee | lpFee << 128` in tokenOut units (source: dex-evm/src/interfaces/IPool.sol,
// dex-evm/src/libraries/PricingLib.sol).
//
// Only Monad (143) has a live pool factory; BNB (56) is a zeroed scaffold and Base/Arc have no
// pool factory record, so only monad is listed.
const SWAPPED =
  'event Swapped(address indexed sender, address indexed recipient, address indexed tokenIn, address tokenOut, uint256 amounts, uint256 fees, uint256 prices, uint256 outBook, uint256 outState)';

const abi = {
  getOfficialPoolsCount:
    'function getOfficialPoolsCount() view returns (uint256)',
  officialPools: 'function officialPools(uint256) view returns (address)',
  getPoolTokens: 'function getPoolTokens(address pool) view returns (address[])',
  getBuffer:
    'function getBuffer(address token) view returns (uint256 reserves, uint256 invested, uint256 minLiquidity)',
  lpToken: 'function lpToken(address token) view returns (address)',
};

const U128 = (1n << 128n) - 1n;

const toBigInt = (value) => BigInt(value.toString());

const normalizeTimestamp = (timestamp) =>
  timestamp === null || timestamp === undefined
    ? Math.floor(Date.now() / 1000)
    : Number(timestamp);

const getBlocks = async (timestamp) => {
  const [weekStartBlock, dayStartBlock, endBlock] =
    await utils.getBlocksByTime(
      [
        timestamp - 7 * SECONDS_PER_DAY,
        timestamp - SECONDS_PER_DAY,
        timestamp,
      ],
      CHAIN
    );
  return { weekStartBlock, dayStartBlock, endBlock };
};

const getLegs = async () => {
  const { output: count } = await sdk.api.abi.call({
    target: FACTORY,
    abi: abi.getOfficialPoolsCount,
    chain: CHAIN,
  });
  if (!Number(count)) return [];
  const { output: pools } = await sdk.api.abi.multiCall({
    target: FACTORY,
    abi: abi.officialPools,
    calls: Array.from({ length: Number(count) }, (_, i) => ({ params: [i] })),
    chain: CHAIN,
  });
  const poolAddresses = pools.map((p) => p.output);
  const { output: tokenLists } = await sdk.api.abi.multiCall({
    target: FACTORY,
    abi: abi.getPoolTokens,
    calls: poolAddresses.map((pool) => ({ params: [pool] })),
    chain: CHAIN,
  });

  const legs = [];
  tokenLists.forEach((list, i) => {
    list.output.forEach((token) =>
      legs.push({ pool: poolAddresses[i], token })
    );
  });

  const { output: buffers } = await sdk.api.abi.multiCall({
    abi: abi.getBuffer,
    calls: legs.map(({ pool, token }) => ({ target: pool, params: [token] })),
    chain: CHAIN,
  });
  const { output: lpTokens } = await sdk.api.abi.multiCall({
    abi: abi.lpToken,
    calls: legs.map(({ pool, token }) => ({ target: pool, params: [token] })),
    chain: CHAIN,
  });
  legs.forEach((leg, i) => {
    const buf = buffers[i].output;
    leg.reserves = toBigInt(buf.reserves ?? buf[0]);
    leg.invested = toBigInt(buf.invested ?? buf[1] ?? 0);
    leg.lpToken = lpTokens[i].output;
  });
  return legs;
};

const getFeeRevenue = async (legs, fromBlock, toBlock) => {
  const pools = [...new Set(legs.map((leg) => leg.pool))];
  if (!pools.length || fromBlock >= toBlock) return new Map();
  const logs = await sdk.getEventLogs({
    targets: pools,
    eventAbi: SWAPPED,
    fromBlock,
    toBlock,
    chain: CHAIN,
  });
  // Key by emitting pool + output token: two official pools can share a base asset, and
  // keying by token alone would attribute both pools' fees to every leg and overstate APY.
  const accrued = new Map(); // `${pool}:${tokenOut}` (lowercase) -> BigInt lpFee in token units
  for (const log of logs) {
    const args = log.args ?? log;
    const pool = String(log.address).toLowerCase();
    const tokenOut = String(args.tokenOut).toLowerCase();
    const lpFee = toBigInt(args.fees) >> 128n;
    const key = `${pool}:${tokenOut}`;
    accrued.set(key, (accrued.get(key) ?? 0n) + lpFee);
  }
  return accrued;
};

const apy = async (timestampArg = null) => {
  const timestamp = normalizeTimestamp(timestampArg);
  const [legs, blocks] = await Promise.all([getLegs(), getBlocks(timestamp)]);
  if (!legs.length) return [];

  const tokens = [...new Set(legs.map((leg) => leg.token))];
  const { pricesByAddress } = await utils.getPrices(tokens, CHAIN);
  const { output: meta } = await sdk.api.abi.multiCall({
    abi: 'erc20:symbol',
    calls: tokens.map((token) => ({ target: token })),
    chain: CHAIN,
  });
  const { output: supplies } = await sdk.api.abi.multiCall({
    abi: 'erc20:totalSupply',
    calls: legs.map((leg) => ({ target: leg.lpToken })),
    chain: CHAIN,
  });
  const { output: decimals } = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    calls: tokens.map((token) => ({ target: token })),
    chain: CHAIN,
  });
  const symbolByToken = {};
  tokens.forEach((token, i) => {
    symbolByToken[token.toLowerCase()] = meta[i].output;
  });
  const decimalsByToken = {};
  tokens.forEach((token, i) => {
    decimalsByToken[token.toLowerCase()] = Number(decimals[i].output);
  });

  const [dayFees, weekFees] = await Promise.all([
    getFeeRevenue(legs, blocks.dayStartBlock, blocks.endBlock),
    getFeeRevenue(legs, blocks.weekStartBlock, blocks.endBlock),
  ]);

  const pools = [];
  legs.forEach((leg, i) => {
    const token = leg.token.toLowerCase();
    const price = pricesByAddress[token];
    if (!Number.isFinite(price)) return; // skip unpriced legs rather than emit a wrong TVL
    const decimalsForLeg = decimalsByToken[token];
    const scale = 10 ** decimalsForLeg;
    // Liquid reserves only: hook-invested tranches are in Euler/Aave, which DefiLlama lists
    // separately, so counting them here would double count (matches the TVL adapter).
    const liquidReserves = leg.reserves - leg.invested;
    const reserveAmount = Number(liquidReserves) / scale;
    const tvlUsd = reserveAmount * price;
    if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) return;
    const feeKey = `${leg.pool.toLowerCase()}:${token}`;
    const dayFeeUsd =
      (Number(dayFees.get(feeKey) ?? 0n) / scale) * price;
    const weekFeeUsd =
      (Number(weekFees.get(feeKey) ?? 0n) / scale) * price;

    pools.push({
      pool: `${leg.lpToken.toLowerCase()}-${CHAIN}`,
      chain: DISPLAY_CHAIN,
      project: PROJECT,
      symbol: symbolByToken[token],
      tvlUsd,
      apyBase: (dayFeeUsd / tvlUsd) * DAYS_PER_YEAR * 100,
      apyBase7d: (weekFeeUsd / tvlUsd) * (DAYS_PER_YEAR / 7) * 100,
      underlyingTokens: [leg.token],
      token: leg.lpToken,
      url: 'https://btr.markets',
    });
  });

  return pools.filter((pool) => utils.keepFinite(pool));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://btr.markets',
};
