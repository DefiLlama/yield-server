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
  feeGrowth0: 'uint256:feeGrowthGlobal0X128',
  feeGrowth1: 'uint256:feeGrowthGlobal1X128',
  liquidity: 'uint128:liquidity',
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

// Trading fees earned by the pool over the last day, from the change in the pool's
// global fee growth accumulators. Uniswap V3 tracks fees per unit of in-range liquidity,
// so the delta multiplied by liquidity is what the pool actually earned.
const getFeeApyBase = async (api, hrusdPrice, usdcPrice) => {
  const block = await api.getBlock();
  const dayAgo = block - BLOCKS_PER_DAY;

  const read = (b) =>
    Promise.all([
      api.call({ abi: ABI.feeGrowth0, target: POOL, block: b }),
      api.call({ abi: ABI.feeGrowth1, target: POOL, block: b }),
      api.call({ abi: ABI.liquidity, target: POOL, block: b }),
    ]);

  const [[f0, f1, liq], [p0, p1]] = await Promise.all([read(undefined), read(dayAgo)]);

  // Accumulators only ever increase, but they are unsigned and wrap; clamp rather than
  // report a negative fee take.
  const grown = (now, then) => {
    const d = BigInt(now) - BigInt(then);
    return d > 0n ? d : 0n;
  };
  const feesOf = (now, then) =>
    Number((grown(now, then) * BigInt(liq)) / Q128) / 1e6;

  const feesUsd = feesOf(f0, p0) * hrusdPrice + feesOf(f1, p1) * usdcPrice;

  // Denominated against the whole pool, which is what an LP in it earns.
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
