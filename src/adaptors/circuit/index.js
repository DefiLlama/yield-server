/**
 * DefiLlama yield/APY adapter for Circuit protocol.
 *
 * Place this directory at src/adaptors/circuit/ in the DefiLlama/yield-server repo.
 *
 * Pools:
 *   1. XCH collateral vault — shows the stability fee (borrow rate) and collateral stats.
 *   2. BYC savings vault   — shows the savings interest rate depositors earn.
 *
 * Data source: https://api.circuitdao.com/protocol/stats
 * The values reported here can be independently verified by running the Circuit block scanner:
 * https://github.com/circuitdao/circuit-analytics
 *
 * Units in the API:
 *   - BYC values: mBYC (milli-BYC); divide by 1000 to get BYC = USD (1 BYC = $1)
 *   - XCH values: mojos; divide by 1e12 to get XCH
 */

const { getData } = require("../utils");
const axios = require("axios");

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const STATUTES_API = "https://api.circuitdao.com/statutes";
const MCAT = 1000;   // mBYC → BYC (= USD)

async function apy() {
  const [data, statutesResp] = await Promise.all([
    getData(STATS_API),
    axios
      .post(STATUTES_API, { full: false }, { timeout: 10_000 })
      .catch(() => null),
  ]);
  const statutesData = statutesResp?.data ?? {};
  if (!Array.isArray(data?.stats) || data.stats.length === 0) {
    throw new Error("Circuit stats API returned empty or invalid data");
  }

  // stats is oldest-first; take the most recent entry
  const s = data.stats[data.stats.length - 1];

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const collateralUsd = toNum(s.collateral_usd);
  const borrowedBYC = toNum(s.byc_in_circulation) / MCAT;      // total BYC minted (USD)
  const savingsBalanceBYC = toNum(s.savings_balance) / MCAT;   // BYC in savings vaults (USD)

  // Stability fee APY: annualised fee income / outstanding principal
  // projected_revenue = undiscounted_principal * annual_rate (in mBYC)
  const undiscountedPrincipal = toNum(s.undiscounted_principal);
  const projectedRevenue = toNum(s.projected_revenue);
  const stabilityFeeApy =
    undiscountedPrincipal > 0
      ? (projectedRevenue / undiscountedPrincipal) * 100
      : 0;

  // LTV: derived from the on-chain VAULT_LIQUIDATION_RATIO_PCT statute
  // liquidation_ratio_pct is the minimum collateral ratio (e.g. 166 means 166% collateral required)
  // LTV = 100 / liquidation_ratio_pct
  const liquidationRatioPct = toNum(
    statutesData?.implemented_statutes?.VAULT_LIQUIDATION_RATIO_PCT
  );
  const rawLtv = liquidationRatioPct > 0 ? 100 / liquidationRatioPct : null;
  const ltv = rawLtv !== null && rawLtv >= 0 && rawLtv <= 1 ? rawLtv : null;

  // Savings APY: annualised interest cost / undiscounted savings balance
  // undiscounted_savings_balance = savings_balance + accrued_interest (both in mBYC)
  const undiscountedSavings = toNum(s.savings_balance) + toNum(s.accrued_interest);
  const projectedCost = toNum(s.projected_cost);
  const savingsApy =
    undiscountedSavings > 0
      ? (projectedCost / undiscountedSavings) * 100
      : 0;

  return [
    // XCH collateral vault — borrow market
    {
      pool: "circuit-xch-vault",
      project: "circuit",
      chain: "Chia",
      symbol: "XCH",
      tvlUsd: collateralUsd,
      totalSupplyUsd: collateralUsd,
      totalBorrowUsd: borrowedBYC,
      apyBase: 0,
      apyReward: 0,
      apyBaseBorrow: stabilityFeeApy,
      mintedCoin: "BYC",
      ltv,
      poolMeta: "XCH collateral vault",
      url: "https://circuitdao.com/borrow",
    },
    // BYC savings vault — supply market
    {
      pool: "circuit-byc-savings",
      project: "circuit",
      chain: "Chia",
      symbol: "BYC",
      tvlUsd: savingsBalanceBYC,
      apyBase: savingsApy,
      poolMeta: "BYC savings vault",
      url: "https://circuitdao.com/earn",
    },
  ];
}

module.exports = {
  timetravel: false,
  apy,
  url: "https://circuitdao.com",
};
