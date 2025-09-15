const utils = require("../utils");

const AFFLUENT_MULTIPLY_VAULT_API_URL = "https://api.affluent.org/v2/api/strategyvaults";
const AFFLUENT_LENDING_VAULT_API_URL = "https://api.affluent.org/v2/api/sharevaults";

const nowSec = () => Math.floor(Date.now() / 1000);

const getAPY = async () => {
    try {
        const [strategy, share] = await Promise.all([
            getStrategyVaultsMapped(),
            getShareVaultsMapped(),
        ]);

        const merged = [...strategy, ...share];
        return merged;
    } catch (err) {
        console.error("getAPY failed:", err);
        return [];
    }
};

async function getStrategyVaultsMapped() {
    const res = await fetch(AFFLUENT_MULTIPLY_VAULT_API_URL);
    if (!res.ok) {
        throw new Error(`Strategy API error: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error("Strategy: Unexpected response shape (not an array)");
    }

    return data.map((v) =>
        mapToOutput({
            address: v.address,
            symbol: v?.symbol,
            tvl: v?.tvl,
            netApy: v?.netApy,
        })
    );
}

async function getShareVaultList() {
    const res = await fetch(AFFLUENT_LENDING_VAULT_API_URL);
    if (!res.ok) {
        throw new Error(`Share list API error: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error("Share list: Unexpected response shape (not an array)");
    }
    return data;
}

async function getShareVaultPoint(address, ts = nowSec()) {
    const url = `${AFFLUENT_LENDING_VAULT_API_URL}/${address}?from=${ts}&to=${ts}&unit=3600`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Share point API error(${address}): HTTP ${res.status} ${res.statusText}`);
    }

    const arr = await res.json();
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

async function getShareVaultsMapped() {
    const list = await getShareVaultList();
    const ts = nowSec();

    const results = await Promise.allSettled(
        list.map(async (v) => {
            const p = await getShareVaultPoint(v.address, ts);
            const netApy = typeof p?.apy === "number" ? p.apy : undefined;
            const tvl = p?.tvl;

            return mapToOutput({
                address: v.address,
                symbol: v?.symbol,
                tvl,
                netApy,
            });
        })
    );

    return results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        const sv = list[i];
        return mapToOutput({
            address: sv.address,
            symbol: sv?.symbol,
            tvl: 0,
            netApy: undefined,
        });
    });
}

module.exports = {
    apy: getAPY,
    timetravel: false,
    url: "https://affluent.org",
};

function toNumberOr0(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function mapToOutput({ address, symbol, tvl, netApy }) {
    const pool = `${address}-TON`;
    const project = "affluent";
    const apyBase = netApy;

    return {
        pool,
        chain: "TON",
        project,
        symbol: String(symbol ?? ""),
        tvlUsd: toNumberOr0(tvl),
        ...(apyBase !== undefined ? { apyBase } : {}),
    };
}