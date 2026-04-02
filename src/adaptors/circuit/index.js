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

const { get } = require("../helper/http");

const STATS_API = "https://api.circuitdao.com/protocol/stats";
const MCAT = 1000;   // mBYC → BYC (= USD)

async function apy() {
  const data = await get(STATS_API);
  if (!Array.isArray(data?.stats) || data.stats.length === 0) {
    throw new Error("Circuit stats API returned empty or invalid data");
  }

  // stats is oldest-first; take the most recent entry
  const s = data.stats[data.stats.length - 1];

  const collateralUsd = s.collateral_usd ?? 0;
  const borrowedBYC = s.byc_in_circulation / MCAT;      // total BYC minted (USD)
  const savingsBalanceBYC = s.savings_balance / MCAT;   // BYC in savings vaults (USD)

  // Stability fee APY: annualised fee income / outstanding principal
  // projected_revenue = undiscounted_principal * annual_rate (in mBYC)
  const stabilityFeeApy =
    s.undiscounted_principal > 0
      ? (s.projected_revenue / s.undiscounted_principal) * 100
      : 0;

  // Savings APY: annualised interest cost / undiscounted savings balance
  // undiscounted_savings_balance = savings_balance + accrued_interest (both in mBYC)
  const undiscountedSavings = s.savings_balance + s.accrued_interest;
  const savingsApy =
    undiscountedSavings > 0
      ? (s.projected_cost / undiscountedSavings) * 100
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
      apyBaseBorrow: stabilityFeeApy,
      mintedCoin: "BYC",
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
