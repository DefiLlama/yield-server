// DefiLlama yields adapter for PARE — goes in yield-server/src/adaptors/pare/index.js
// Two kinds of pool:
//  - one per live series: the fixed rate earned by buying the pToken at its Uniswap price and
//    holding to maturity, where it redeems for one stock token (Robinhood Chain) or one dollar of
//    a yield-bearing dollar such as sUSDx (Ethereum);
//  - the pToken/USDG liquidity pools: the 0.3% Uniswap v3 fee tier plus Merkl rewards in USDG,
//    as Merkl reports them for the pool, over the pool's whole TVL.
// Nothing about a Robinhood Chain series is written here. The SeriesRegistry contract lists the live
// vaults; each vault names its stock, its pToken and its maturity; the tokens name themselves; the
// Uniswap factory names the pools. A new series appears here when PARE lists it in the registry.
const sdk = require("@defillama/sdk");
const utils = require("../utils");
const { merklGet } = require("../merkl/merkl-client");

const CHAIN = "robinhood";
const CHAIN_ID = 4663;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // Global Dollar (Paxos), 6 decimals
const UNI_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"; // Uniswap v3 on Robinhood Chain
const PT_STOCK_FEE = 500;  // the pToken/stock pools: 0.05% tier
const PT_USDG_FEE = 3000;  // the pToken/USDG pools: 0.3% tier
const REGISTRY = "0x44aB19D42E45CA53E380A7E6CFa95e87a4c0E4A5"; // SeriesRegistry: vaults() lists every live StripVault
const ZERO = "0x0000000000000000000000000000000000000000";

const ABI = {
  slot0: "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  token0: "function token0() view returns (address)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
  symbol: "function symbol() view returns (string)",
  stock: "function stock() view returns (address)",
  pt: "function pt() view returns (address)",
  maturity: "function maturity() view returns (uint64)",
  getPool: "function getPool(address, address, uint24) view returns (address)",
  vaults: "function vaults() view returns (address[])",
  getSlot0: "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  convertToAssets: "function convertToAssets(uint256) view returns (uint256)",
};

// Ethereum: the dollar series. Each PT trades against its share (sUSDx) in a Uniswap v4 pool, read through StateView by
// the pool's id (the hash of its key: PT, sUSDx, the dynamic-fee flag, tick spacing 10, PARE's PtPoolHook). The share's
// own rate turns the PT's price in shares into dollars of the underlying (USDx), which is what a PT pays at maturity.
const ETH = "ethereum";
const STATE_VIEW = "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227"; // Uniswap v4 StateView on Ethereum
const ETH_SERIES = [
  { key: "pusdx-mar27", symbol: "pUSDx-MAR27", vault: "0xFB0c70eaDdc3717A9c95E3D6c5B791244437a25c", pt: "0x4F7597B81e1F209d366cf0ea0025C903871979E0",
    share: "0xEB892628D1E58BC475A6dCB7F5dBC4F591632AA4", poolId: "0x5cabac5acbae101fe4ec6be9d49ee9d45f2052b39bb3c8c5483b65583add5bc1", ptIs0: true },
];

const call = (target, abi, params) => sdk.api2.abi.call({ target, abi, params, chain: CHAIN });
const callOn = (chain, target, abi, params) => sdk.api2.abi.call({ target, abi, params, chain });
const multi = (abi, calls) => sdk.api2.abi.multiCall({ abi, calls, chain: CHAIN });
const dateOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10); // 2027-12-31

// Every series from its vault: stock, pToken, maturity, the symbols, and the two Uniswap pools.
async function series() {
  const VAULTS = await call(REGISTRY, ABI.vaults);
  if (!VAULTS.length) return [];
  const [stocks, pts, maturities] = await Promise.all([
    multi(ABI.stock, VAULTS.map((target) => ({ target }))),
    multi(ABI.pt, VAULTS.map((target) => ({ target }))),
    multi(ABI.maturity, VAULTS.map((target) => ({ target }))),
  ]);
  const [ptSymbols, stockSymbols, pools, usdgPools] = await Promise.all([
    multi(ABI.symbol, pts.map((target) => ({ target }))),
    multi(ABI.symbol, stocks.map((target) => ({ target }))),
    multi(ABI.getPool, pts.map((pt, i) => ({ target: UNI_FACTORY, params: [pt, stocks[i], PT_STOCK_FEE] }))),
    multi(ABI.getPool, pts.map((pt) => ({ target: UNI_FACTORY, params: [pt, USDG, PT_USDG_FEE] }))),
  ]);
  return VAULTS.map((vault, i) => ({
    vault, stock: stocks[i], pt: pts[i], maturity: Number(maturities[i]), symbol: ptSymbols[i], stockSymbol: stockSymbols[i],
    pool: pools[i] && pools[i] !== ZERO ? pools[i] : null,
    usdgPool: usdgPools[i] && usdgPools[i] !== ZERO ? usdgPools[i] : null,
  }));
}

// Merkl's live campaigns on one pool: daily USDG rewards, as their API reports them.
// null when Merkl can't be read, so the pool is skipped rather than published at 0%.
async function merklDailyUsd(pool) {
  try {
    const list = await merklGet(`/v4/opportunities?chainId=${CHAIN_ID}&status=LIVE&identifier=${pool.toLowerCase()}`);
    if (!Array.isArray(list)) throw new Error("unexpected response");
    return list.reduce((a, o) => a + (Number(o.dailyRewards) || 0), 0);
  } catch (e) {
    console.error(`pare: Merkl read failed for ${pool}: ${e.message}`);
    return null;
  }
}

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const SERIES = await series();
  const prices = await utils.getPrices([...SERIES.map((s) => s.stock), USDG], CHAIN);
  const usdgUsd = prices.pricesByAddress[USDG.toLowerCase()] || 1; // a dollar stablecoin; 1 until DefiLlama prices it

  const pools = [];
  for (const s of SERIES) {
    const years = (s.maturity - now) / (365.25 * 86400);
    if (!s.pool || years <= 0) continue; // no market yet, or matured: nothing to earn
    const [slot0, token0, held] = await Promise.all([
      call(s.pool, ABI.slot0), call(s.pool, ABI.token0), call(s.stock, ABI.balanceOf, [s.vault]),
    ]);
    // price of token1 in token0 = (sqrtPriceX96 / 2^96)^2; both tokens have 18 decimals
    const raw = (Number(slot0.sqrtPriceX96) / 2 ** 96) ** 2;
    const ptPerStock = token0.toLowerCase() === s.pt.toLowerCase() ? raw : 1 / raw; // stock per pToken
    if (!(ptPerStock > 0) || years <= 0) continue;
    const fixed = (Math.pow(1 / ptPerStock, 1 / years) - 1) * 100;
    const stockUsd = prices.pricesByAddress[s.stock.toLowerCase()] || 0;
    pools.push({
      pool: `${s.pt}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: "pare",
      symbol: s.symbol,
      tvlUsd: (Number(held) / 1e18) * stockUsd,
      apyBase: fixed,
      underlyingTokens: [s.stock],
      poolMeta: `fixed to ${dateOf(s.maturity)}, redeems 1 ${s.stockSymbol}`,
      url: `https://parestocks.com/app?series=${s.stockSymbol.toLowerCase()}`,
    });

    if (!s.usdgPool) continue;
    // The pToken/USDG pool: TVL from the pool's balances, the pToken priced by the pool itself
    // (USDG per pToken, 18 against 6 decimals), rewards from Merkl over the whole TVL.
    const [ps0, pt0, ptHeld, usdgHeld, daily] = await Promise.all([
      call(s.usdgPool, ABI.slot0), call(s.usdgPool, ABI.token0),
      call(s.pt, ABI.balanceOf, [s.usdgPool]), call(USDG, ABI.balanceOf, [s.usdgPool]), merklDailyUsd(s.usdgPool),
    ]);
    if (daily === null) continue;
    const praw = (Number(ps0.sqrtPriceX96) / 2 ** 96) ** 2;
    const usdgPerPt = (pt0.toLowerCase() === s.pt.toLowerCase() ? praw : 1 / praw) * 1e12;
    const tvlUsd = (Number(ptHeld) / 1e18) * usdgPerPt * usdgUsd + (Number(usdgHeld) / 1e6) * usdgUsd;
    if (!(tvlUsd > 0)) continue;
    pools.push({
      pool: `${s.usdgPool}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: "pare",
      symbol: `${s.symbol}-USDG`,
      tvlUsd,
      apyReward: daily > 0 ? (daily * 365 / tvlUsd) * 100 : 0,
      rewardTokens: daily > 0 ? [USDG] : [],
      underlyingTokens: [s.pt, USDG],
      poolMeta: `Uniswap v3 0.3%, accretes to 1 ${s.stockSymbol}`,
      url: "https://parestocks.com/dividend-lp",
    });
  }

  // Ethereum: one row per dollar series, the fixed rate in USDx terms from the PT's price in its v4 pool.
  const ethPrices = await utils.getPrices(ETH_SERIES.map((s) => s.share), ETH);
  for (const s of ETH_SERIES) {
    const [maturity, slot0, rate, held] = await Promise.all([
      callOn(ETH, s.vault, ABI.maturity), callOn(ETH, STATE_VIEW, ABI.getSlot0, [s.poolId]),
      callOn(ETH, s.share, ABI.convertToAssets, ["1000000000000000000"]), callOn(ETH, s.share, ABI.balanceOf, [s.vault]),
    ]);
    const years = (Number(maturity) - now) / (365.25 * 86400);
    if (years <= 0) continue; // matured: nothing left to lock
    const raw = (Number(slot0.sqrtPriceX96) / 2 ** 96) ** 2; // token1 per token0, both 18 decimals
    const ptInDollars = (s.ptIs0 ? raw : 1 / raw) * (Number(rate) / 1e18); // shares per PT, times dollars per share
    if (!(ptInDollars > 0)) continue;
    pools.push({
      pool: `${s.pt}-${ETH}`.toLowerCase(),
      chain: utils.formatChain(ETH),
      project: "pare",
      symbol: s.symbol,
      tvlUsd: (Number(held) / 1e18) * (ethPrices.pricesByAddress[s.share.toLowerCase()] || 0),
      apyBase: (Math.pow(1 / ptInDollars, 1 / years) - 1) * 100,
      underlyingTokens: [s.share],
      poolMeta: `fixed to ${dateOf(Number(maturity))}, redeems 1 USDx of sUSDx`,
      url: `https://parestocks.com/app#/y/lock/${s.key}`,
    });
  }
  return pools;
};

module.exports = { timetravel: false, apy, url: "https://parestocks.com", protocolId: "8703" }; // DefiLlama protocol id for PARE
