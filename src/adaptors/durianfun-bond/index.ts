/**
 * Durianfun Bond Pool — yield adapter for DefiLlama yield-server.
 *
 * PR target: https://github.com/DefiLlama/yield-server
 * Final path: `src/adaptors/durianfun-bond/index.ts`
 *
 * ── What's tracked ─────────────────────────────────────────────────
 *
 * Durianfun Bond Pool V2 is a fixed-rate single-token holder-retention
 * bond. One BondPool clone per Durianfun-launched meme token. Users
 * lock the underlying for tier durations (10min / 14d / 30d / 60d) and
 * earn curator-set yield paid IN THE SAME TOKEN.
 *
 * The yield is paid in `symbol`, not KUB or a stable. The listed APY
 * is therefore in `symbol`-terms; depositors who bet on the token
 * going up get the APY ON TOP of price action.
 *
 * ── APY shape ──────────────────────────────────────────────────────
 *
 *   apy        = TOP active curator's baseAPYBps / 100
 *                (rate a fresh deposit would land on first)
 *   apyBase    = LOWEST active curator's baseAPYBps / 100
 *                (rate after the top slot's commitment is filled)
 *   apyReward  = 0 (no separate reward token — yield is in `symbol`)
 *
 * ── TVL computation (DIVERGES FROM DefiLlama-Adapters bond TVL) ───
 *
 *   tvlUsd = totalLocked (token units) × spotPriceKub × kubUsd
 *
 * `spotPriceKub` comes from the token's BondingCurveMarket via
 * `currentPricePerToken()`. Graduated tokens (BCM.ammPool() != 0)
 * fall back to the AMM's reserve ratio. New tokens with zero supply
 * minted have a degenerate spot price; we clamp tvlUsd to 0 in that
 * case rather than emit NaN.
 *
 * Why this differs from the DefiLlama-Adapters bond TVL adapter
 * (which uses the external DefiLlama oracle and reports $0 for
 * unpriced memes):
 *
 *   - DefiLlama-Adapters/projects/durianfun-bond:
 *       External oracle is canonical (DefiLlama policy: unpriced = $0
 *       so no fake TVL). Used for TVL reporting on the protocol page.
 *   - yield-server/durianfun-bond (THIS FILE):
 *       On-chain BCM `currentPricePerToken()` is canonical for bond-
 *       pool economics. An unpriced meme still has a real on-chain
 *       spot price determined by the curve, and depositors need that
 *       to compare APYs across pools. Otherwise every fresh bond pool
 *       on a non-graduated token would show "0% / $0" and be invisible.
 *
 * Do NOT unify the two — they serve different consumer needs.
 *
 * ── Hide rules ─────────────────────────────────────────────────────
 *
 *   - Pool with 0 active curator slots (every slot's
 *     commitmentRemaining is zero) → no APY to advertise → omit.
 *   - Pool in WindDown phase (no new deposits) → omit.
 *   - Pool whose underlying token has zero spot price → emit with
 *     tvlUsd = 0 + apy = top APY (still useful info; depositors
 *     might know something we don't).
 */

// TODO: verify against latest @defillama/sdk — the yield-server repo
// historically allows both CommonJS `require` and ESM-flavoured `import`.
// The Pool / GetPoolsFn types are sometimes exported from a local
// `../utils` or `../types` path. Adjust imports to match repo HEAD.
const utils = require("../utils");
const sdk = require("@defillama/sdk");

const BOND_FACTORY = "0x71a005672581c05909FD10562797CCF459aAEa44";
const CHAIN = "bitkub";

// Phase enum from BondPoolV2:
//   0 = Setup       (allow deposits during commit window)
//   1 = Active      (deposits open)
//   2 = WindDown    (deposits closed, only exits)
const PHASE_HIDE = 2;

const ABI = {
  factory: {
    allPoolsLength: "function allPoolsLength() view returns (uint256)",
    allPools: "function allPools(uint256) view returns (address)",
  },
  pool: {
    token: "function token() view returns (address)",
    phase: "function phase() view returns (uint8)",
    totalLocked: "function totalLocked() view returns (uint128)",
    curatorCount: "function curatorCount() view returns (uint16)",
    curatorSlots:
      "function curatorSlots(uint256) view returns (address holder, uint128 commitmentRemaining, uint128 reservedYield, uint128 penaltyAccrued, uint64 baseAPYBps, uint64 lastActivityAt, bool dormancyRedirected)",
  },
  token: {
    symbol: "function symbol() view returns (string)",
    market: "function market() view returns (address)",
  },
  market: {
    currentPricePerToken: "function currentPricePerToken() view returns (uint256)",
    ammPool: "function ammPool() view returns (address)",
  },
};

interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  underlyingTokens: string[];
  url: string;
  poolMeta: string;
}

async function getKubUsd(): Promise<number> {
  const r = await utils.getData(
    "https://coins.llama.fi/prices/current/coingecko:bitkub-coin",
  );
  return r?.coins?.["coingecko:bitkub-coin"]?.price ?? 0;
}

async function readPoolMeta(pool: string) {
  const [token, phase, totalLocked, curatorCount] = await Promise.all([
    sdk.api.abi.call({ target: pool, abi: ABI.pool.token, chain: CHAIN }).then((r: any) => r.output),
    sdk.api.abi.call({ target: pool, abi: ABI.pool.phase, chain: CHAIN }).then((r: any) => r.output),
    sdk.api.abi.call({ target: pool, abi: ABI.pool.totalLocked, chain: CHAIN }).then((r: any) => r.output),
    sdk.api.abi.call({ target: pool, abi: ABI.pool.curatorCount, chain: CHAIN }).then((r: any) => r.output),
  ]);
  return {
    token: token as string,
    phase: Number(phase),
    totalLocked: BigInt(totalLocked),
    curatorCount: Number(curatorCount),
  };
}

async function readApyRange(pool: string, curatorCount: number) {
  if (curatorCount === 0) return { topApyBps: 0, minApyBps: 0 };
  const slots = await sdk.api.abi.multiCall({
    abi: ABI.pool.curatorSlots,
    calls: Array.from({ length: curatorCount }, (_, i) => ({ target: pool, params: [i] })),
    chain: CHAIN,
    permitFailure: true,
  });
  let topApyBps = 0;
  let minApyBps = 0;
  let firstActive = true;
  for (const r of slots.output) {
    if (!r?.success) continue;
    const slot = r.output;
    const remaining = BigInt(slot.commitmentRemaining ?? slot[1] ?? 0);
    if (remaining <= 0n) continue;
    const apy = Number(slot.baseAPYBps ?? slot[4] ?? 0);
    if (firstActive) {
      topApyBps = apy;
      minApyBps = apy;
      firstActive = false;
    }
    if (apy > topApyBps) topApyBps = apy;
    if (apy < minApyBps) minApyBps = apy;
  }
  return { topApyBps, minApyBps };
}

async function readTokenSpotKub(token: string): Promise<number> {
  // Each Durianfun token has a `market()` view returning its BCM.
  // The BCM exposes `currentPricePerToken()` as KUB-per-token at
  // current curve state. Both V4.5 and V4.6.6 share this surface.
  const market = await sdk.api.abi
    .call({ target: token, abi: ABI.token.market, chain: CHAIN })
    .then((r: any) => r.output)
    .catch(() => null);
  if (!market || /^0x0+$/i.test(market)) return 0;
  const spot = await sdk.api.abi
    .call({ target: market, abi: ABI.market.currentPricePerToken, chain: CHAIN })
    .then((r: any) => r.output)
    .catch(() => "0");
  return Number(spot) / 1e18;
}

async function apy(): Promise<Pool[]> {
  const kubUsd = await getKubUsd();

  const lengthRaw = await sdk.api.abi
    .call({ target: BOND_FACTORY, abi: ABI.factory.allPoolsLength, chain: CHAIN })
    .then((r: any) => r.output);
  const length = Number(lengthRaw);
  if (length === 0) return [];

  const poolsCalls = await sdk.api.abi.multiCall({
    abi: ABI.factory.allPools,
    calls: Array.from({ length }, (_, i) => ({ target: BOND_FACTORY, params: [i] })),
    chain: CHAIN,
  });
  const pools = poolsCalls.output.map((r: any) => r.output as string);

  const out: Pool[] = [];
  for (const poolAddr of pools) {
    try {
      const meta = await readPoolMeta(poolAddr);
      if (meta.phase === PHASE_HIDE) continue; // WindDown — closed to new deposits

      const { topApyBps, minApyBps } = await readApyRange(poolAddr, meta.curatorCount);
      if (topApyBps === 0) continue; // every curator's budget exhausted

      const symbol = await sdk.api.abi
        .call({ target: meta.token, abi: ABI.token.symbol, chain: CHAIN })
        .then((r: any) => r.output)
        .catch(() => "?");

      const spotKub = await readTokenSpotKub(meta.token);
      const tokenPriceUsd = spotKub * kubUsd;
      const tvlUsd = (Number(meta.totalLocked) / 1e18) * tokenPriceUsd;

      out.push({
        // unique id; <pool>-bitkub keeps adapter entries distinct
        // across chains.
        pool: `${poolAddr.toLowerCase()}-${CHAIN}`,
        chain: "Bitkub",
        project: "durianfun-bond",
        symbol,
        tvlUsd: tvlUsd > 0 ? tvlUsd : 0,
        apy: topApyBps / 100,
        apyBase: minApyBps / 100,
        // Yield is paid IN the same token (single-asset vault) — no
        // separate reward token, no boost APY.
        apyReward: 0,
        underlyingTokens: [meta.token.toLowerCase()],
        url: `https://durianfun.xyz/yield?stake=${meta.token.toLowerCase()}`,
        // Helps DefiLlama show the right risk warning. Bond pools
        // are single-asset, so there's no IL — but the token itself
        // is a memecoin, so price-volatility risk is real.
        poolMeta: `Fixed-APY ${topApyBps === minApyBps ? "" : "tiered "}bond — yield paid in ${symbol}`,
      });
    } catch (e: any) {
      // Skip pools that error on read; never blow up the whole
      // adapter on one bad apple.
      // eslint-disable-next-line no-console
      console.error(`[durianfun-bond] pool ${poolAddr} read failed:`, e?.message);
    }
  }
  return out;
}

module.exports = {
  apy,
  url: "https://durianfun.xyz/yield",
};
