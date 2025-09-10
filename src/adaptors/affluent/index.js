const utils = require('../utils');

const AFFLUENT_API_URL = "https://api.affluent.org/v2/api/strategyvaults/";

const getAPY = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
        const res = await fetch(AFFLUENT_API_URL, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });

        if (!res.ok) {
            throw new Error(`API error: HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        if (!Array.isArray(data)) {
            throw new Error("Unexpected response shape: not an array");
        }

        const vaults = data.map((v) => {
            const pool = `${v.address}-TON`;
            const project = "affluent";
            const apyBase = v.netApy;
            const tvl =
                typeof v?.tvl === "number"
                    ? v.tvl
                    : typeof v?.tvl === "string"
                        ? Number(v.tvl)
                        : 0;

            return {
                pool,
                chain: "TON",
                project,
                symbol: String(v?.symbol ?? ""),
                tvlUsd: tvl,
                ...(apyBase !== undefined ? { apyBase } : {}),
            };
        });

        return vaults;
    } catch (err) {
        console.error("Failed to fetch and map strategy vaults:", err);
    }
}

module.exports = {
    timetravel: false,
    url: 'https://affluent.org',
    apy: getAPY,
};
