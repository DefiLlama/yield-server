// DefiLlama yields adapter for PARE — goes in yield-server/src/adaptors/pare/index.js
// Two kinds of pool:
//  - one per live series: the fixed rate earned by buying the pToken at its Uniswap price and
//    holding to maturity, where it redeems for one stock token;
//  - the pToken/USDG liquidity pools: the 0.3% Uniswap v3 fee tier plus Merkl rewards in USDG,
//    as Merkl reports them for the pool, over the pool's whole TVL.
const sdk = require("@defillama/sdk");
const utils = require("../utils");

const CHAIN = "robinhood";
const CHAIN_ID = 4663;
const MATURITY = 1830211200; // 2027-12-31 00:00 UTC
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"; // Global Dollar (Paxos), 6 decimals
const SERIES = [
  { symbol: "pSPY-DEC27",  stock: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", stockSymbol: "SPY",  pt: "0x1d0d084ee243eC25876547E69Ca54A499E253ac9", vault: "0xa0f77015E46e45c1A12B73466A08711a28Dac1A7", pool: "0x1506CeAF13B25757713dd128e98980F49fCE4d25" },
  { symbol: "pAAPL-DEC27", stock: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", stockSymbol: "AAPL", pt: "0xa674f5Ac6c5b89A64b631378a8f5703804F18aa7", vault: "0x131179E65Ab5C0538f5191920233Fd9Dc31930d1", pool: "0x03A4d0C68353D71E56D67D83fDc0318a1a01Ba34" },
  { symbol: "pQQQ-DEC27",  stock: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", stockSymbol: "QQQ",  pt: "0xadA9e22Cba6D1802d06400E883f5b4d663a85853", vault: "0xAb8e536C9E7c76C1045EDEb6096e9B37B26B4372", pool: "0x9D0963AB5Bfdb22EC917fb7eE6e3702523F512d1" },
  { symbol: "pPFE-DEC27",  stock: "0x7066A64c24e4206CD62E83bf198c1E7EB361F51e", stockSymbol: "PFE",  pt: "0x2574d6E64bC2c4326cB35d8a2B2126FD300a7F79", vault: "0x1aC9599B91973A3d5d75F7594a47382223FEC0F5", pool: "0xaAE222E92441323c602247d5B0c9BE1554aD68f8",
    // the pToken's dollar pool: Uniswap v3, 0.3% tier, Merkl rewards in USDG from 2026-09-20
    usdgPool: "0x074d4AC450A88EfC26c2dAb28a5144A1F56f626c" },
];

const ABI = {
  slot0: "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  token0: "function token0() view returns (address)",
  balanceOf: "function balanceOf(address) view returns (uint256)",
};

const call = (target, abi, params) => sdk.api2.abi.call({ target, abi, params, chain: CHAIN });

// Merkl's live campaigns on one pool: daily USDG rewards, as their API reports them.
async function merklDailyUsd(pool) {
  try {
    const list = await utils.getData(`https://api.merkl.xyz/v4/opportunities?chainId=${CHAIN_ID}&status=LIVE&identifier=${pool.toLowerCase()}`);
    return (Array.isArray(list) ? list : []).reduce((a, o) => a + (Number(o.dailyRewards) || 0), 0);
  } catch { return 0; }
}

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const years = (MATURITY - now) / (365.25 * 86400);
  const prices = await utils.getPrices([...SERIES.map((s) => s.stock), USDG], CHAIN);
  const usdgUsd = prices.pricesByAddress[USDG.toLowerCase()] || 1; // a dollar stablecoin; 1 until DefiLlama prices it

  const pools = [];
  for (const s of SERIES) {
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
      poolMeta: `fixed to 2027-12-31, redeems 1 ${s.stockSymbol}`,
      url: `https://parestocks.com/app?series=${s.stockSymbol.toLowerCase()}`,
    });

    if (!s.usdgPool) continue;
    // The pToken/USDG pool: TVL from the pool's balances, the pToken priced by the pool itself
    // (USDG per pToken, 18 against 6 decimals), rewards from Merkl over the whole TVL.
    const [ps0, pt0, ptHeld, usdgHeld, daily] = await Promise.all([
      call(s.usdgPool, ABI.slot0), call(s.usdgPool, ABI.token0),
      call(s.pt, ABI.balanceOf, [s.usdgPool]), call(USDG, ABI.balanceOf, [s.usdgPool]), merklDailyUsd(s.usdgPool),
    ]);
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
      poolMeta: "Uniswap v3 0.3% tier; the pToken climbs to 1 stock token by 2027-12-31",
      url: "https://parestocks.com/dividend-lp",
    });
  }
  return pools;
};

module.exports = { timetravel: false, apy, url: "https://parestocks.com", protocolId: "8703" };
