const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CHAIN = 'base';
const HRUSD = '0x5587AD03F9565F1B86cfA51a3C744Bcc4039dAf0';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const POOL = '0xAE2E818A18e95212FAE482e2180bC89546393DC9';
const POSITION_MANAGER = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

// Both V3LPStakingRewards deployments escrow HRUSD/USDC position NFTs and accrue
// rewards on the same terms. The legacy one still holds stakes, so it is included.
const STAKERS = [
  '0xb72f376ae7732a76F1C18e0547553A616a33a2bd',
  '0xA61C08DeC414416E55de7b4510bA8Ef25C89886a',
];

const ABI = {
  aprBps: 'uint256:aprBps',
  bpsDenominator: 'uint256:BPS_DENOMINATOR',
  balanceOf: 'erc20:balanceOf',
  tokenOfOwnerByIndex:
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  previewAmounts:
    'function previewAmounts(uint256 tokenId) view returns (uint256 amt0, uint256 amt1, uint256 principalHrusd)',
  observe:
    'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128)',
  pendingRewards: 'function pendingRewards(uint256 tokenId) view returns (uint256)',
  fee: 'uint24:fee',
  swap:
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
};

// Base produces a block roughly every 2s.
const BLOCKS_PER_DAY = 43200;
const Q128 = 2n ** 128n;

// Same window the staking contracts use for their own principal valuation
// (`twapWindowSeconds() == 1800`).
const TWAP_WINDOW = 1800;

// HRUSD has no price feed on DefiLlama, so it is valued against USDC from its own
// Uniswap V3 pool, over the same TWAP window the staking contract reads for principal.
// A time-averaged tick is used rather than the spot price so that a swap at the sampled
// block cannot move the reported TVL. `observe` reverts if the pool's observation
// cardinality does not cover the window, which fails the run rather than reporting a
// manipulable number.
const getPrices = async (api) => {
  const [observation, usdc] = await Promise.all([
    api.call({ abi: ABI.observe, target: POOL, params: [[TWAP_WINDOW, 0]] }),
    utils.getData(`https://coins.llama.fi/prices/current/${CHAIN}:${USDC}`),
  ]);

  const usdcPrice = Object.values(usdc.coins)[0]?.price;
  if (!usdcPrice) throw new Error('hrusd: missing USDC price');

  const [start, end] = observation.tickCumulatives;
  const avgTick = Number(BigInt(end) - BigInt(start)) / TWAP_WINDOW;
  if (!Number.isFinite(avgTick)) throw new Error('hrusd: invalid TWAP observation');

  // `observe` proves the window exists, not that anything was backing the price during it.
  // The harmonic mean of in-range liquidity over the window comes out of the seconds-per-
  // liquidity accumulator; if it is degenerate the tick describes an empty pool and the
  // price derived from it means nothing. No floor above zero is imposed: any figure would
  // be arbitrary, and HRUSD has no second venue to fall back on, so rejecting on a guessed
  // threshold would drop the pool rather than protect it.
  const [splStart, splEnd] = observation.secondsPerLiquidityCumulativeX128;
  const splDelta = BigInt(splEnd) - BigInt(splStart);
  const harmonicLiquidity =
    splDelta > 0n ? Number((BigInt(TWAP_WINDOW) * Q128) / splDelta) : 0;
  if (!(harmonicLiquidity > 0))
    throw new Error('hrusd: no liquidity backing the TWAP window');

  // HRUSD is token0, USDC is token1, both 6 decimals, so the tick needs no decimal shift
  return { hrusdPrice: 1.0001 ** avgTick * usdcPrice, usdcPrice };
};

// Rewards accrue linearly on `principalHrusd`, the HRUSD-denominated value of each
// staked position, so the pool's TVL is the sum of those principals. The same walk over
// the staked positions yields `owed`, the rewards already accrued to stakers, which the
// reward runway below has to net out of the contracts' balance.
const getStakedPositions = async (api) => {
  const counts = await api.multiCall({
    abi: ABI.balanceOf,
    target: POSITION_MANAGER,
    calls: STAKERS.map((owner) => ({ params: [owner] })),
  });

  const idCalls = [];
  STAKERS.forEach((owner, i) => {
    for (let j = 0; j < Number(counts[i]); j += 1)
      idCalls.push({ owner, params: [owner, j] });
  });
  if (!idCalls.length) return { principal: 0, owed: 0 };

  const tokenIds = await api.multiCall({
    abi: ABI.tokenOfOwnerByIndex,
    target: POSITION_MANAGER,
    calls: idCalls.map(({ params }) => ({ params })),
  });

  const perStaker = STAKERS.map((staker) => {
    const calls = idCalls
      .map(({ owner }, k) => (owner === staker ? { params: [tokenIds[k]] } : null))
      .filter(Boolean);
    return { staker, calls };
  });

  // No permitFailure anywhere here: a missing result would silently understate TVL or
  // overstate how much reward inventory is unspoken for.
  const [previews, pending] = await Promise.all([
    Promise.all(
      perStaker.map(({ staker, calls }) =>
        calls.length ? api.multiCall({ abi: ABI.previewAmounts, target: staker, calls }) : []
      )
    ),
    Promise.all(
      perStaker.map(({ staker, calls }) =>
        calls.length ? api.multiCall({ abi: ABI.pendingRewards, target: staker, calls }) : []
      )
    ),
  ]);

  return {
    principal: previews.flat().reduce((a, p) => a + Number(p.principalHrusd) / 1e6, 0),
    owed: pending.flat().reduce((a, v) => a + Number(v) / 1e6, 0),
  };
};

// Trading fees earned by the pool over the last day. Taken from the Swap events
// themselves rather than from the fee-growth accumulators: `feeGrowthGlobal` rises by
// fee/liquidity at each swap, so multiplying its delta by any single liquidity reading is
// only correct while liquidity is unchanged over the window. Summing the fee cut of each
// swap's input amount is exact regardless of how liquidity moved.
const getFeeApyBase = async (api, hrusdPrice, usdcPrice) => {
  const block = await api.getBlock();
  const [feeTier, logs] = await Promise.all([
    api.call({ abi: ABI.fee, target: POOL }),
    sdk.getEventLogs({
      target: POOL,
      chain: CHAIN,
      fromBlock: block - BLOCKS_PER_DAY,
      toBlock: block,
      eventAbi: ABI.swap,
      onlyArgs: true,
    }),
  ]);

  // Uniswap V3 takes its fee from the input side, which is the amount the pool receives.
  let fees0 = 0;
  let fees1 = 0;
  for (const { amount0, amount1 } of logs) {
    const a0 = BigInt(amount0);
    const a1 = BigInt(amount1);
    if (a0 > 0n) fees0 += Number(a0) / 1e6;
    if (a1 > 0n) fees1 += Number(a1) / 1e6;
  }
  const rate = Number(feeTier) / 1e6;
  const feesUsd = (fees0 * hrusdPrice + fees1 * usdcPrice) * rate;

  // Fees accrue to every in-range position, not only the staked ones, so the yield is
  // measured against the whole pool rather than against this entry's staked TVL.
  const [bal0, bal1] = await api.multiCall({
    abi: ABI.balanceOf,
    calls: [
      { target: HRUSD, params: [POOL] },
      { target: USDC, params: [POOL] },
    ],
  });
  const poolTvl = (Number(bal0) / 1e6) * hrusdPrice + (Number(bal1) / 1e6) * usdcPrice;
  if (!poolTvl) return 0;

  return (feesUsd / poolTvl) * 365 * 100;
};

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });

  const [aprBps, denominators] = await Promise.all([
    api.multiCall({ abi: ABI.aprBps, calls: STAKERS.map((target) => ({ target })) }),
    api.multiCall({ abi: ABI.bpsDenominator, calls: STAKERS.map((target) => ({ target })) }),
  ]);

  // Lower bound across deployments, per the repo's unboosted-value rule. No haircut
  // is applied for early exit: the exit fee is set to zero, and no ExitFeesPaid event
  // has ever fired on the current deployment (the legacy one charged 0.98 HRUSD in
  // total over its lifetime). Unstaking is subject to a 24h delay, not a penalty.
  const nominalApr = Math.min(
    ...aprBps.map((bps, i) => (Number(bps) / Number(denominators[i])) * 100)
  );

  const [{ principal, owed }, prices, balances] = await Promise.all([
    getStakedPositions(api),
    getPrices(api),
    api.multiCall({
      abi: ABI.balanceOf,
      calls: STAKERS.map((staker) => ({ target: HRUSD, params: [staker] })),
    }),
  ]);
  const { hrusdPrice, usdcPrice } = prices;

  // `aprBps` is an owner-set parameter, not a rate derived from emissions, so on its own
  // it would keep advertising the same yield after the reward pool ran dry. Rewards are
  // paid out of HRUSD held by the staking contracts, part of which is already accrued to
  // stakers; only the remainder can fund future accrual. If nothing is left unspoken for,
  // the advertised rate is not payable and no reward APY is reported.
  const inventory = balances.reduce((acc, v) => acc + Number(v) / 1e6, 0);
  const unspokenFor = Math.max(0, inventory - owed);
  const apyReward = unspokenFor > 0 ? nominalApr : 0;

  const apyBase = await getFeeApyBase(api, hrusdPrice, usdcPrice);

  return [
    {
      pool: `${POOL}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'hrusd',
      symbol: utils.formatSymbol('HRUSD-USDC'),
      tvlUsd: principal * hrusdPrice,
      apyBase,
      apyReward,
      rewardTokens: [HRUSD],
      underlyingTokens: [HRUSD, USDC],
      token: POOL,
      poolMeta: 'Uniswap V3 LP staking',
      url: 'https://hyperoute.xyz/',
    },
  ];
};

module.exports = {
  protocolId: '8458',
  timetravel: false,
  apy,
  url: 'https://hyperoute.xyz/',
};
