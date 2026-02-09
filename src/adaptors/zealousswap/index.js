// Zealous Swap (Kasplex) — Pools adapter for DefiLlama yield-server
// Fetches pool data from our API and reserves on-chain, calculating TVL using DefiLlama's price feeds.
//
// Endpoint used: https://kasplex.zealousswap.com/v1/pools
// Notes:
// - Reserves are fetched on-chain via getReserves(), with API fallback if call fails
// - TVL is calculated from token reserves using DefiLlama's price API
// - Falls back to API's TVL value if DefiLlama prices are unavailable
// - We use `apr` from our API as `apyBase` (already annualized %)
// - If `apr` is missing, we fall back to fee APR from volume * feeRate
// - We include `apyReward` only if our API reports a positive `farmApr`

const axios = require("axios");
const sdk = require("@defillama/sdk");
const BigNumber = require("bignumber.js");

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

const getPrices = async (addresses, chain) => {
    const prices = (
        await axios.get(
            `https://coins.llama.fi/prices/current/${addresses
                .map((address) => `${chain}:${address}`)
                .join(',')
                .toLowerCase()}`
        )
    ).data.coins;

    const pricesObj = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesObj;
};

const calculateReservesUSD = (
    reserve0,
    reserve1,
    token0Address,
    token1Address,
    decimals0,
    decimals1,
    tokenPrices
) => {
    const token0Price = tokenPrices[token0Address.toLowerCase()];
    const token1Price = tokenPrices[token1Address.toLowerCase()];

    const reserve0Adjusted = new BigNumber(reserve0).div(10 ** decimals0);
    const reserve1Adjusted = new BigNumber(reserve1).div(10 ** decimals1);

    if (token0Price) return reserve0Adjusted.times(token0Price).times(2);
    if (token1Price) return reserve1Adjusted.times(token1Price).times(2);

    return null;
};

async function apy() {
    const { data } = await axios.get(API);
    const poolsObj = data?.pools || {};

    const poolAddresses = Object.keys(poolsObj);
    if (poolAddresses.length === 0) return [];

    const reservesResults = await sdk.api.abi.multiCall({
        abi: {
            inputs: [],
            name: "getReserves",
            outputs: [
                { internalType: "uint112", name: "_reserve0", type: "uint112" },
                { internalType: "uint112", name: "_reserve1", type: "uint112" },
                { internalType: "uint32", name: "_blockTimestampLast", type: "uint32" }
            ],
            stateMutability: "view",
            type: "function"
        },
        calls: poolAddresses.map((address) => ({
            target: address,
        })),
        chain: CHAIN,
        permitFailure: true,
    });

    const tokenAddresses = new Set();
    for (const p of Object.values(poolsObj)) {
        if (p.token0?.address) tokenAddresses.add(p.token0.address.toLowerCase());
        if (p.token1?.address) tokenAddresses.add(p.token1.address.toLowerCase());
    }

    const tokenPrices = await getPrices(Array.from(tokenAddresses), CHAIN);

    const results = [];

    for (let i = 0; i < poolAddresses.length; i++) {
        const address = poolAddresses[i];
        const p = poolsObj[address];

        if (!p.token0?.address || !p.token1?.address) continue;

        const reserveData = reservesResults.output[i];
        let reserve0, reserve1;

        if (reserveData && reserveData.success && reserveData.output) {
            reserve0 = reserveData.output._reserve0 || reserveData.output[0];
            reserve1 = reserveData.output._reserve1 || reserveData.output[1];
        } else {
            reserve0 = p.token0Reserves;
            reserve1 = p.token1Reserves;
        }

        if (!reserve0 || !reserve1) continue;

        const tvlFromReserves = calculateReservesUSD(
            reserve0,
            reserve1,
            p.token0.address,
            p.token1.address,
            p.token0.decimals,
            p.token1.decimals,
            tokenPrices
        );

        const tvlUsd = tvlFromReserves
            ? Number(tvlFromReserves.toString())
            : toNumber(p.tvl);

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
            underlyingTokens: [p.token0.address, p.token1.address],
            url: "https://app.zealousswap.com/liquidity",
            volumeUsd1d: toNumber(p.volumeUSD),
        });
    }

    return results.filter(x => Number.isFinite(x.tvlUsd) && x.tvlUsd > 0);
}

module.exports = {
    timetravel: false,
    apy,
    url: API,
};