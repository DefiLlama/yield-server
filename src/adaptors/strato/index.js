const sdk = require('@defillama/sdk');

const utils = require('../utils');

// STRATO is BlockApps' institutional L1. It is served over a public,
// unauthenticated JSON-RPC node that the DefiLlama TVL adapter already uses.
// @defillama/sdk resolves the RPC for chain `strato` from the STRATO_RPC env var.
const RPC_URL = 'https://noderpc.strato.nexus/rpc';
if (!process.env.STRATO_RPC) process.env.STRATO_RPC = RPC_URL;

const CHAIN = 'strato';
const PROJECT = 'strato';
const URL = 'https://app.strato.nexus';

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

// Core protocol contracts (system precompile-style addresses) + live deployments.
const PRICE_ORACLE = '0x0000000000000000000000000000000000001002';
const LENDING_REGISTRY = '0x0000000000000000000000000000000000001007';
const LENDING_POOL = '0x0000000000000000000000000000000000001005';
const POOL_FACTORY = '0x000000000000000000000000000000000000100a';
const SAVE_USDST_VAULT = '0x22550671fcad04a213697ac7ae4f4366e96446ed';
const STAKING = '0xf30a022ce83bed7adeafc286c719388dcc3b3988';
const USDST = '0x937efa7e3a77e20bbdbd7c0d32b6514f368c1010';
const STRATO = '0x2ca3e170e6714282da77815f7864b17f612f5f83';

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

// ---- helpers ---------------------------------------------------------------

const call = async (target, abi, params) =>
  (await sdk.api.abi.call({ target, abi, params, chain: CHAIN })).output;

// Compound a per-second RAY (1e27) growth factor to an annual percentage.
// Isolate the small per-second increment before converting to float to keep precision.
const rayPerSecondToApy = (rayFactor) => {
  const increment = Number(BigInt(rayFactor) - RAY) / 1e27;
  return (Math.pow(1 + increment, SECONDS_PER_YEAR) - 1) * 100;
};

// DefiLlama prices most STRATO tokens (USDST, GOLDST, ETH, ...). Tokens it does
// not index (e.g. STRATO) fall back to the on-chain PriceOracle (1e18 USD).
const getPrices = async (tokens) => {
  const uniq = [...new Set(tokens.map((t) => t.toLowerCase()))];
  const keyFor = (a) => `${CHAIN}:${a}`;

  let coins = {};
  try {
    const path = `/prices/current/${uniq.map(keyFor).join(',')}`;
    coins = (await utils.getPriceApiData(path)).coins || {};
  } catch (e) {
    coins = {};
  }

  const prices = {};
  for (const a of uniq) {
    const c = coins[keyFor(a)];
    if (c && Number.isFinite(c.price) && c.price > 0) {
      prices[a] = c.price;
      continue;
    }
    try {
      const p = await call(
        PRICE_ORACLE,
        'function getAssetPrice(address) view returns (uint256)',
        a
      );
      const v = Number(BigInt(p)) / 1e18;
      if (Number.isFinite(v) && v > 0) prices[a] = v;
    } catch (e) {
      // no price available — caller decides whether to skip the pool
    }
  }
  return prices;
};

// ---- pools -----------------------------------------------------------------

// saveUSDST savings vault: USDST in, share token appreciates at the savings rate.
async function saveVaultPool() {
  const [totalAssets, savingsRate] = await Promise.all([
    call(SAVE_USDST_VAULT, 'function totalAssets() view returns (uint256)'),
    call(
      SAVE_USDST_VAULT,
      'function perSecondSavingsRate() view returns (uint256)'
    ),
  ]);

  const prices = await getPrices([USDST]);
  const usdstPrice = prices[USDST.toLowerCase()];
  if (!usdstPrice) return [];

  return [
    {
      pool: `${SAVE_USDST_VAULT}-strato`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USDST',
      tvlUsd: (Number(BigInt(totalAssets)) / 1e18) * usdstPrice,
      apyBase: rayPerSecondToApy(savingsRate),
      underlyingTokens: [USDST],
      poolMeta: 'saveUSDST savings vault',
      url: URL,
    },
  ];
}

// USDST lending pool. Supply APY = borrowApr * utilization * (1 - reserveFactor).
async function lendingPool() {
  const prices = await getPrices([USDST]);
  const usdstPrice = prices[USDST.toLowerCase()];
  if (!usdstPrice) return [];

  const [borrowIndex, totalScaledDebt, cfg, liquidityPool] = await Promise.all([
    call(LENDING_POOL, 'function previewBorrowIndex() view returns (uint256)'),
    call(LENDING_POOL, 'function totalScaledDebt() view returns (uint256)'),
    call(
      LENDING_POOL,
      'function getAssetConfig(address) view returns (uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 interestRate, uint256 reserveFactor, uint256 perSecondFactorRAY)',
      USDST
    ),
    call(LENDING_REGISTRY, 'function liquidityPool() view returns (address)'),
  ]);

  const cash = BigInt(await call(USDST, 'erc20:balanceOf', liquidityPool));
  const borrows = (BigInt(totalScaledDebt) * BigInt(borrowIndex)) / RAY;
  const supplied = cash + borrows;
  if (supplied === 0n) return [];

  const totalSupplied = Number(supplied) / 1e18;
  const totalBorrows = Number(borrows) / 1e18;
  const utilization = totalBorrows / totalSupplied;

  const reserveFactor = Number(cfg.reserveFactor ?? cfg[4]) / 1e4;
  const ltv = Number(cfg.ltv ?? cfg[0]) / 1e4;
  const borrowApr = rayPerSecondToApy(cfg.perSecondFactorRAY ?? cfg[5]); // percent

  return [
    {
      pool: `${LENDING_POOL}-strato`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USDST',
      tvlUsd: totalSupplied * usdstPrice,
      apyBase: (borrowApr / 100) * utilization * (1 - reserveFactor) * 100,
      apyBaseBorrow: borrowApr,
      totalSupplyUsd: totalSupplied * usdstPrice,
      totalBorrowUsd: totalBorrows * usdstPrice,
      ltv,
      borrowable: true,
      underlyingTokens: [USDST],
      poolMeta: 'lendUSDST lending',
      url: URL,
    },
  ];
}

// STRATO staking. Rewards are paid in STRATO, so apyReward is price-independent.
async function stakingPool() {
  const [totalStake, rewardAmount, periodStart, periodFinish] =
    await Promise.all([
      call(STAKING, 'function totalRewardableStake() view returns (uint256)'),
      call(STAKING, 'function rewardPeriodAmount() view returns (uint256)'),
      call(STAKING, 'function periodStart() view returns (uint256)'),
      call(STAKING, 'function periodFinish() view returns (uint256)'),
    ]);

  const totalStakeBI = BigInt(totalStake);
  if (totalStakeBI === 0n) return [];

  const prices = await getPrices([STRATO]);
  const stratoPrice = prices[STRATO.toLowerCase()];
  if (!stratoPrice) return [];

  const now = Math.floor(Date.now() / 1000);
  const duration = Number(periodFinish) - Number(periodStart);

  let apyReward = 0;
  if (Number(periodFinish) > now && duration > 0) {
    const annualReward =
      (Number(BigInt(rewardAmount)) / 1e18) * (SECONDS_PER_YEAR / duration);
    const stakedTokens = Number(totalStakeBI) / 1e18;
    apyReward = (annualReward / stakedTokens) * 100;
  }

  return [
    {
      pool: `${STAKING}-strato`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'STRATO',
      tvlUsd: (Number(totalStakeBI) / 1e18) * stratoPrice,
      apyReward,
      rewardTokens: [STRATO],
      underlyingTokens: [STRATO],
      poolMeta: 'STRATO staking',
      url: URL,
    },
  ];
}

async function enumeratePools() {
  const pools = [];
  for (let i = 0; i < 500; i++) {
    let addr;
    try {
      addr = await call(
        POOL_FACTORY,
        'function allPools(uint256) view returns (address)',
        i
      );
    } catch (e) {
      break; // out of bounds -> reverts
    }
    if (!addr || addr.toLowerCase() === NULL_ADDRESS) break;
    pools.push(addr.toLowerCase());
  }
  return pools;
}

// AMM LP pools. TVL is read from on-chain reserves. Swap fees are not reported:
// the pool fee rate has no public getter over eth_call, and the active pools have
// no swap volume in a trailing window, so base APY would be 0 regardless. Pools are
// reported TVL-only (apyBase 0); fee APY can be added if a fee getter is exposed.
async function ammPools() {
  const poolAddrs = await enumeratePools();
  if (!poolAddrs.length) return [];

  const metas = [];
  for (const pool of poolAddrs) {
    try {
      const [tokenA, tokenB] = await Promise.all([
        call(pool, 'function tokenA() view returns (address)'),
        call(pool, 'function tokenB() view returns (address)'),
      ]);
      const [balA, balB] = await Promise.all([
        call(tokenA, 'erc20:balanceOf', pool),
        call(tokenB, 'erc20:balanceOf', pool),
      ]);
      metas.push({
        pool,
        tokenA: tokenA.toLowerCase(),
        tokenB: tokenB.toLowerCase(),
        balA: BigInt(balA),
        balB: BigInt(balB),
      });
    } catch (e) {
      // not a readable 2-token pool -> skip
    }
  }

  const active = metas.filter((m) => m.balA > 0n || m.balB > 0n);
  if (!active.length) return [];

  const tokens = [...new Set(active.flatMap((m) => [m.tokenA, m.tokenB]))];
  const [prices, symbols] = await Promise.all([
    getPrices(tokens),
    (async () => {
      const s = {};
      for (const t of tokens) {
        try {
          s[t] = await call(t, 'erc20:symbol');
        } catch (e) {
          s[t] = '?';
        }
      }
      return s;
    })(),
  ]);

  const pools = [];
  for (const m of active) {
    const priceA = prices[m.tokenA];
    const priceB = prices[m.tokenB];
    if (!priceA || !priceB) continue; // avoid mispriced TVL

    const tvlUsd =
      (Number(m.balA) / 1e18) * priceA + (Number(m.balB) / 1e18) * priceB;
    if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) continue;

    pools.push({
      pool: `${m.pool}-strato`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(`${symbols[m.tokenA]}-${symbols[m.tokenB]}`),
      tvlUsd,
      apyBase: 0,
      underlyingTokens: [m.tokenA, m.tokenB],
      poolMeta: 'AMM LP',
      url: URL,
    });
  }

  return pools;
}

const apy = async () => {
  const groups = await Promise.all([
    saveVaultPool().catch(() => []),
    lendingPool().catch(() => []),
    stakingPool().catch(() => []),
    ammPools().catch(() => []),
  ]);

  return groups
    .flat()
    .filter(Boolean)
    .filter((p) => Number.isFinite(p.tvlUsd) && p.tvlUsd >= utils.MIN_TVL_USD);
};

module.exports = {
  protocolId: '7862',
  timetravel: false,
  apy,
  url: `${URL}/pools`,
};
