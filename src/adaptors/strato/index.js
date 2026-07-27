const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CHAIN = 'strato';
const PROJECT = 'strato';
const APP = 'https://app.strato.nexus';

// Per-pool pages in the STRATO app.
const SAVE_URL = `${APP}/dashboard/earn-save`;
const LENDING_URL = `${APP}/dashboard/earn-lending`;
const STAKING_URL = `${APP}/dashboard/earn-staking`;

const RAY = 10n ** 27n;
const SECONDS_PER_YEAR = 31_536_000;

// Core protocol contracts (system precompile-style addresses) + live deployments.
const PRICE_ORACLE = '0x0000000000000000000000000000000000001002';
const LENDING_REGISTRY = '0x0000000000000000000000000000000000001007';
const LENDING_POOL = '0x0000000000000000000000000000000000001005';
const SAVE_USDST_VAULT = '0x22550671fcad04a213697ac7ae4f4366e96446ed';
const STAKING = '0xf30a022ce83bed7adeafc286c719388dcc3b3988';
const USDST = '0x937efa7e3a77e20bbdbd7c0d32b6514f368c1010';
const STRATO = '0x2ca3e170e6714282da77815f7864b17f612f5f83';

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
  const [totalAssets, savingsRate, exchangeRate] = await Promise.all([
    call(SAVE_USDST_VAULT, 'function totalAssets() view returns (uint256)'),
    call(
      SAVE_USDST_VAULT,
      'function perSecondSavingsRate() view returns (uint256)'
    ),
    // USDST redeemable per saveUSDST share, 1e18-scaled.
    call(SAVE_USDST_VAULT, 'function exchangeRate() view returns (uint256)'),
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
      pricePerShare: Number(BigInt(exchangeRate)) / 1e18,
      poolMeta: 'saveUSDST savings vault',
      url: SAVE_URL,
    },
  ];
}

// USDST lending pool. Supply rate = borrow rate * utilization * (1 - reserveFactor),
// compounded per-second before annualizing. TVL is available cash (liquidity).
async function lendingPool() {
  const prices = await getPrices([USDST]);
  const usdstPrice = prices[USDST.toLowerCase()];
  if (!usdstPrice) return [];

  const [borrowIndex, totalScaledDebt, cfg, liquidityPool, mTokenRate] =
    await Promise.all([
      call(
        LENDING_POOL,
        'function previewBorrowIndex() view returns (uint256)'
      ),
      call(LENDING_POOL, 'function totalScaledDebt() view returns (uint256)'),
      call(
        LENDING_POOL,
        'function getAssetConfig(address) view returns (uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 interestRate, uint256 reserveFactor, uint256 perSecondFactorRAY)',
        USDST
      ),
      call(LENDING_REGISTRY, 'function liquidityPool() view returns (address)'),
      // USDST redeemable per mUSDST supply receipt, 1e18-scaled.
      call(LENDING_POOL, 'function getExchangeRate() view returns (uint256)'),
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
  // Derive the supply per-second rate before annualizing; compounding the
  // borrow APY first would overstate the supply APY.
  const borrowRatePerSecond =
    Number(BigInt(cfg.perSecondFactorRAY ?? cfg[5]) - RAY) / 1e27;
  const borrowApy =
    (Math.pow(1 + borrowRatePerSecond, SECONDS_PER_YEAR) - 1) * 100;
  const supplyRatePerSecond =
    borrowRatePerSecond * utilization * (1 - reserveFactor);
  const supplyApy =
    (Math.pow(1 + supplyRatePerSecond, SECONDS_PER_YEAR) - 1) * 100;

  return [
    {
      pool: `${LENDING_POOL}-strato`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USDST',
      tvlUsd: (Number(cash) / 1e18) * usdstPrice,
      apyBase: supplyApy,
      apyBaseBorrow: borrowApy,
      totalSupplyUsd: totalSupplied * usdstPrice,
      totalBorrowUsd: totalBorrows * usdstPrice,
      ltv,
      borrowable: true,
      underlyingTokens: [USDST],
      pricePerShare: Number(BigInt(mTokenRate)) / 1e18,
      poolMeta: 'lendUSDST lending',
      url: LENDING_URL,
    },
  ];
}

// STRATO staking. Rewards are paid in STRATO, so apyReward is price-independent.
// Phase 1 staking is reward accounting only — there is no transferable receipt
// token, so no pricePerShare.
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
  if (
    Number(periodStart) <= now &&
    Number(periodFinish) > now &&
    duration > 0
  ) {
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
      url: STAKING_URL,
    },
  ];
}

// Note: the AMM LP pools (GOLDST/USDST, ETH/USDST, ...) are intentionally not
// reported. The pool swap-fee rate has no public getter over eth_call, so fee
// APY cannot be computed; they will be added once a fee getter is exposed.

const apy = async () => {
  const groups = await Promise.all([
    saveVaultPool().catch(() => []),
    lendingPool().catch(() => []),
    stakingPool().catch(() => []),
  ]);

  return groups.flat().filter(Boolean);
};

module.exports = {
  protocolId: '7862',
  timetravel: false,
  apy,
  url: `${APP}/dashboard/earn`,
};
