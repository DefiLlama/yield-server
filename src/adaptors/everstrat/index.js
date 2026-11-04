const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const utils = require('../utils');

const CHAIN = 'ethereum';
const STRATEGY_MANAGER = '0x94916ab93C669E7c734f844dB019Ce9449a3b5C9';
const EVE = '0x8FE6A43672fCa70d41e112B8426387665fD061EC';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

const DAY = 86400;
const Q128 = 2n ** 128n;
const MOD = 2n ** 256n;

const abi = {
  strategies: 'address[]:strategies',
  performanceFeeBps: 'uint256:performanceFeeBps',
  totalNAVInETH: 'uint256:totalNAVInETH',
  totalDeposited: 'uint256:totalDeposited',
  totalWithdrawn: 'uint256:totalWithdrawn',
  pool: 'address:pool',
  token0: 'address:token0',
  positionMain:
    'function positionMain() view returns (int24 tickLower, int24 tickUpper)',
  positionAlt:
    'function positionAlt() view returns (int24 tickLower, int24 tickUpper)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  feeGrowthGlobal0X128: 'uint256:feeGrowthGlobal0X128',
  feeGrowthGlobal1X128: 'uint256:feeGrowthGlobal1X128',
  positions:
    'function positions(bytes32 key) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  ticks:
    'function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
};

const call = (target, fn, block) =>
  sdk.api.abi
    .call({ target, abi: abi[fn], block, chain: CHAIN })
    .then((r) => r.output);

const multiCall = (fn, calls, block) =>
  sdk.api.abi
    .multiCall({
      abi: abi[fn],
      calls,
      block,
      chain: CHAIN,
      permitFailure: false,
    })
    .then((r) => r.output.map((o) => o.output));

// The SDK has no eth_getStorageAt wrapper; try its RPCs in turn (archival first, since we read past blocks)
const storage = async (target, slot, block) => {
  const llama = sdk.getProvider(CHAIN);
  let error;
  for (const { provider } of [...llama.archivalRPCs, ...llama.rpcs]) {
    try {
      return BigInt(await provider.getStorage(target, slot, block ?? 'latest'));
    } catch (e) {
      error = e;
    }
  }
  throw error;
};

const positionKey = (owner, lower, upper) =>
  ethers.utils.solidityKeccak256(
    ['address', 'int24', 'int24'],
    [owner, lower, upper]
  );

// UniCLStrat keeps its lifetime LP fee counters in private storage (no getter):
// _cumulativeLpFeesEarned0/1 and _lpFeesOwedSnapshot0/1. Some deployments have one extra
// slot in front, so locate the layout by matching the public totalDeposited/totalWithdrawn.
const counterSlots = async (strategy) => {
  const [deposited, withdrawn] = await Promise.all([
    call(strategy, 'totalDeposited'),
    call(strategy, 'totalWithdrawn'),
  ]);
  for (const off of [0, 1]) {
    const [d, w] = await Promise.all([
      storage(strategy, 1 + off),
      storage(strategy, 2 + off),
    ]);
    if (d === BigInt(deposited) && w === BigInt(withdrawn))
      return [3, 4, 7, 8].map((s) => s + off);
  }
  throw new Error(`everstrat: unknown storage layout for ${strategy}`);
};

// Uniswap V3 fee growth inside [lower, upper), as in Tick.getFeeGrowthInside
const feeGrowthInside = (tick, lower, upper, global, outLower, outUpper) => {
  const below = tick >= lower ? outLower : (global - outLower + MOD) % MOD;
  const above = tick < upper ? outUpper : (global - outUpper + MOD) % MOD;
  return (global - below - above + 2n * MOD) % MOD;
};

// Lifetime LP fees earned by each strategy at `block`, in token0/token1 units: the stored
// counter, plus tokensOwed not yet flushed into it, plus fee growth the pool has not credited
// to the position yet (unpoked).
const lpFeesEarned = async (strategies, block) => {
  if (!strategies.length) return [];
  const targets = strategies.map((s) => ({ target: s.strategy }));
  const pools = strategies.map((s) => ({ target: s.pool }));
  const [counters, mains, alts, slot0s, globals0, globals1] = await Promise.all(
    [
      Promise.all(
        strategies.map((s) =>
          Promise.all(s.slots.map((slot) => storage(s.strategy, slot, block)))
        )
      ),
      multiCall('positionMain', targets, block),
      multiCall('positionAlt', targets, block),
      multiCall('slot0', pools, block),
      multiCall('feeGrowthGlobal0X128', pools, block),
      multiCall('feeGrowthGlobal1X128', pools, block),
    ]
  );

  const ranges = [];
  strategies.forEach((s, i) => {
    for (const { tickLower, tickUpper } of [mains[i], alts[i]]) {
      if (+tickLower === 0 && +tickUpper === 0) continue; // unused alt range
      const key = positionKey(s.strategy, tickLower, tickUpper);
      ranges.push({ i, lower: +tickLower, upper: +tickUpper, key });
    }
  });
  const positions = await multiCall(
    'positions',
    ranges.map((r) => ({ target: strategies[r.i].pool, params: [r.key] })),
    block
  );
  const tickCalls = ranges.flatMap((r) => [
    { target: strategies[r.i].pool, params: [r.lower] },
    { target: strategies[r.i].pool, params: [r.upper] },
  ]);
  const ticks = await multiCall('ticks', tickCalls, block);

  const owed = strategies.map(() => [0n, 0n]);
  const unpoked = strategies.map(() => [0n, 0n]);
  ranges.forEach(({ i, lower, upper }, j) => {
    const p = positions[j];
    owed[i][0] += BigInt(p.tokensOwed0);
    owed[i][1] += BigInt(p.tokensOwed1);
    const liquidity = BigInt(p.liquidity);
    const [tl, tu] = [ticks[2 * j], ticks[2 * j + 1]];
    const tick = +slot0s[i].tick;
    const inside0 = feeGrowthInside(
      tick,
      lower,
      upper,
      BigInt(globals0[i]),
      BigInt(tl.feeGrowthOutside0X128),
      BigInt(tu.feeGrowthOutside0X128)
    );
    const inside1 = feeGrowthInside(
      tick,
      lower,
      upper,
      BigInt(globals1[i]),
      BigInt(tl.feeGrowthOutside1X128),
      BigInt(tu.feeGrowthOutside1X128)
    );
    unpoked[i][0] +=
      (liquidity *
        ((inside0 - BigInt(p.feeGrowthInside0LastX128) + MOD) % MOD)) /
      Q128;
    unpoked[i][1] +=
      (liquidity *
        ((inside1 - BigInt(p.feeGrowthInside1LastX128) + MOD) % MOD)) /
      Q128;
  });

  return strategies.map((s, i) => {
    const [earned0, earned1, snapshot0, snapshot1] = counters[i];
    const [owed0, owed1] = owed[i];
    return [
      earned0 + (owed0 > snapshot0 ? owed0 - snapshot0 : 0n) + unpoked[i][0],
      earned1 + (owed1 > snapshot1 ? owed1 - snapshot1 : 0n) + unpoked[i][1],
    ];
  });
};

// LP fees earned between startBlock and now, in ETH at the current pool price.
// Covers every strategy registered at either end, so strategy migrations inside the window count.
// A strategy only receives funds once registered, so one added after startBlock starts from zero.
const lpFeesInETH = async (
  strategies,
  earnedNow,
  startBlock,
  atStart,
  atEnd
) => {
  const registered = new Set(atStart.map((a) => a.toLowerCase()));
  const live = new Set(atEnd.map((a) => a.toLowerCase()));
  const old = strategies.filter((s) => registered.has(s.strategy));
  const earnedOld = await lpFeesEarned(old, startBlock);
  const earnedStart = new Map(old.map((s, i) => [s.strategy, earnedOld[i]]));

  return strategies.reduce((total, s, i) => {
    if (!registered.has(s.strategy) && !live.has(s.strategy)) return total;
    const [now0, now1] = earnedNow[i];
    const [start0, start1] = earnedStart.get(s.strategy) ?? [0n, 0n];
    const d0 = Number(now0 > start0 ? now0 - start0 : 0n);
    const d1 = Number(now1 > start1 ? now1 - start1 : 0n);
    const price = Number(BigInt(s.sqrtPriceX96)) ** 2 / 2 ** 192; // token1 per token0, raw units
    return total + (s.wethIsToken0 ? d0 + d1 / price : d0 * price + d1) / 1e18;
  }, 0);
};

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  // NAV samples every 6h over the last day and daily over the week, for time-weighted TVL
  const ts1d = [0, 6, 12, 18, 24].map((h) => now - h * 3600);
  const ts7d = [2, 3, 4, 5, 6, 7].map((d) => now - d * DAY);
  const blocks = await utils.getBlocksByTime([...ts1d, ...ts7d], CHAIN);
  const blocks1d = blocks.slice(0, 5);
  const blocks7d = [blocks[0], blocks[4], ...blocks.slice(5)];
  const [block1d, block7d] = [blocks[4], blocks[blocks.length - 1]];

  const [current, prior1d, prior7d, feeBps, navs] = await Promise.all([
    call(STRATEGY_MANAGER, 'strategies'),
    call(STRATEGY_MANAGER, 'strategies', block1d),
    call(STRATEGY_MANAGER, 'strategies', block7d),
    call(STRATEGY_MANAGER, 'performanceFeeBps').then(Number),
    Promise.all(
      blocks.map((b) =>
        call(STRATEGY_MANAGER, 'totalNAVInETH', b).then((n) => n / 1e18)
      )
    ),
  ]);
  const navAt = Object.fromEntries(blocks.map((b, i) => [b, navs[i]]));

  const addresses = [
    ...new Set(
      [...current, ...prior1d, ...prior7d].map((a) => a.toLowerCase())
    ),
  ];
  const strategies = await Promise.all(
    addresses.map(async (strategy) => {
      const [pool, token0, slots] = await Promise.all([
        call(strategy, 'pool'),
        call(strategy, 'token0'),
        counterSlots(strategy),
      ]);
      const { sqrtPriceX96 } = await call(pool, 'slot0');
      const wethIsToken0 = token0.toLowerCase() === WETH.toLowerCase();
      return { strategy, pool, slots, sqrtPriceX96, wethIsToken0 };
    })
  );
  const earnedNow = await lpFeesEarned(strategies);

  const [fees1d, fees7d] = await Promise.all([
    lpFeesInETH(strategies, earnedNow, block1d, prior1d, current),
    lpFeesInETH(strategies, earnedNow, block7d, prior7d, current),
  ]);
  // Fee APR net of the protocol performance fee. Entry premium paid by new depositors is not counted.
  const netApr = (fees, sampleBlocks, days) =>
    (fees / avg(sampleBlocks.map((b) => navAt[b])) / days) *
    365 *
    100 *
    (1 - feeBps / 1e4);

  const { pricesByAddress } = await utils.getPrices([WETH], CHAIN);

  return [
    {
      pool: `${EVE}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'everstrat',
      symbol: 'ETH',
      tvlUsd: navAt[blocks[0]] * pricesByAddress[WETH.toLowerCase()],
      apyBase: netApr(fees1d, blocks1d, 1),
      apyBase7d: netApr(fees7d, blocks7d, 7),
      underlyingTokens: [WETH],
      token: EVE,
      poolMeta: 'Uniswap V3 strategies',
    },
  ];
};

module.exports = {
  protocolId: '9143',
  timetravel: false,
  apy,
  url: 'https://everstrat.xyz',
};
