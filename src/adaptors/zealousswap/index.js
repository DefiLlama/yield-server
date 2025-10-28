// Zealous Swap (Kasplex) — Pools adapter for DefiLlama yield-server
// Pulls per-pool TVL (USD) and APR directly from our public API.
//
// Endpoint used: https://kasplex.zealousswap.com/v1/pools
// Notes:
// - We use `apr` from our API as `apyBase` (already annualized %).
// - If `apr` is missing, we fall back to fee APR from volume * feeRate.
// - We include `apyReward` only if our API reports a positive `farmApr`.
// - Only emit pools with `hasUSDValues === true` and tvl > 10000 to avoid noise.

const axios = require("axios");

const CHAIN = "kasplex";
const API = "https://kasplex.zealousswap.com/v1/pools";

function toNumber(x) {
    if (x === null || x === undefined) return 0;
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
}

function poolSymbol(p) {
    const s0 = p.token0?.symbol || "T0";
    const s1 = p.token1?.symbol || "T1";
    return `${s0}-${s1}`;
}

function calcFeeAPR(volumeUSD, tvlUsd, feeRate) {
    const vol = toNumber(volumeUSD);
    const tvl = toNumber(tvlUsd);
    const fee = toNumber(feeRate);
    if (tvl <= 0 || vol <= 0 || fee <= 0) return 0;
    return (vol * fee / tvl) * 365 * 100;
}

async function apy() {
    const { data } = await axios.get(API);
    const poolsObj = data?.pools || {};

    const results = [];

    for (const [address, p] of Object.entries(poolsObj)) {

        if (!p?.hasUSDValues) continue;
        const tvlUsd = toNumber(p.tvl);
        if (!(tvlUsd > 0)) continue;

        let apyBase = toNumber(p.apr);

        if (!(apyBase > 0)) {
            const feeRate = p.regularFeeRate ?? p.discountedFeeRate ?? 0.003;
            apyBase = calcFeeAPR(p.volumeUSD, tvlUsd, feeRate);
        }

        const apyReward = toNumber(p.farmApr) > 0 ? toNumber(p.farmApr) : null;

        results.push({
            pool: `${address}-${CHAIN}`,
            chain: CHAIN,
            project: "zealousswap",
            symbol: poolSymbol(p),
            tvlUsd,
            apyBase,
            apyReward,
            rewardTokens: p.hasActiveFarm
                ? ["0xb7a95035618354D9ADFC49Eca49F38586B624040"]
                : [],
            underlyingTokens: [p.token0?.address, p.token1?.address].filter(Boolean),
            url: "https://app.zealousswap.com/liquidity",
            poolMeta: "Zealous Swap spot pool",
            volumeUsd1d: toNumber(p.volumeUSD),
        });
    }

    return results.filter(x => Number.isFinite(x.tvlUsd) && x.tvlUsd >= 10000);
}

module.exports = {
    timetravel: false,
    apy,
};