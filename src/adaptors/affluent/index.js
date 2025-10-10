const utils = require("../utils");

const AFFLUENT_MULTIPLY_VAULT_API_URL = "https://api.affluent.org/v2/api/strategyvaults";
const AFFLUENT_LENDING_VAULT_API_URL = "https://api.affluent.org/v2/api/sharevaults";
const AFFLUENT_ASSETS_API_URL = "https://api.affluent.org/v2/api/assets";

const nowSec = () => Math.floor(Date.now() / 1000);

const getAPY = async () => {
    try {
        const assetMap = await getAssetMap();

        const [strategy, share] = await Promise.all([
            getStrategyVaultsMapped(assetMap),
            getShareVaultsMapped(assetMap),
        ]);

        const merged = [...strategy, ...share];
        return merged;
    } catch (err) {
        console.error("getAPY failed:", err);
        return [];
    }
};

async function getStrategyVaultsMapped(assetMap) {
    const res = await fetch(AFFLUENT_MULTIPLY_VAULT_API_URL);
    if (!res.ok) {
        throw new Error(`Strategy API error: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error("Strategy: Unexpected response shape (not an array)");
    }

    return data.map((v) => {
        const assetKeys = Object.keys(v.assets || {});
        const assetSymbols = assetKeys
            .map((addr) => assetMap[addr] || addr)
            .sort((a, b) => a.localeCompare(b));
        const assetSymbolString = assetSymbols.join("-");

        return mapToOutput({
            address: v.address,
            symbol: assetSymbolString,
            tvl: v.tvl,
            netApy: v.netApy,
        });
    });
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

async function getShareVaultsMapped(assetMap) {
    const list = await getShareVaultList();
    const ts = nowSec();

    const results = await Promise.allSettled(
        list.map(async (v) => {
            const p = await getShareVaultPoint(v.address, ts);
            const netApy = typeof p?.apy === "number" ? p.apy : undefined;
            const tvl = p?.tvl;

            const underlyingSymbol = v?.underlying ? (assetMap[v.underlying] || v.underlying) : undefined;

            return mapToOutput({
                address: v.address,
                symbol: underlyingSymbol,
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

async function getAssetMap() {
    const res = await fetch(AFFLUENT_ASSETS_API_URL);
    if (!res.ok) {
        throw new Error(`Asset API error: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
        throw new Error("Asset: Unexpected response shape (not an array)");
    }

    const map = {};
    for (const item of data) {
        let symbol = item.symbol;

        if (symbol === "FactorialTON") {
            symbol = "TON";
        }

        map[item.address] = symbol;
    }

    return map;
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