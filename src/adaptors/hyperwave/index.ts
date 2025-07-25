const axios = require("axios");
const sdk = require("@defillama/sdk");
const Vault = require("./Vault.json");
const Accountant = require("./Accountant.json");

const hwHLP = "0x9FD7466f987Fd4C45a5BBDe22ED8aba5BC8D72d1";
const hwHLP_ACCOUNTANT = "0x78E3Ac5Bf48dcAF1835e7F9861542c0D43D0B03E";
const UNDERLYING = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const CHAIN = "ethereum";

const apy = async () => {
    const totalSupplyCall = sdk.api.abi.call({
        target: hwHLP,
        abi: Vault.find((m) => m.name === "totalSupply"),
    });
    const decimalsCall = sdk.api.abi.call({
        target: hwHLP,
        abi: Vault.find((m) => m.name === "decimals"),
    });

    const priceKey = `ethereum:${UNDERLYING}`;
    const underlyingPriceCall = axios.get(
        `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`
    );

    const currentRateCall = sdk.api.abi.call({
        target: hwHLP_ACCOUNTANT,
        abi: Accountant.find((m) => m.name === "getRate"),
    });

    const now = Math.floor(Date.now() / 1000);
    const timestamp1dayAgo = now - 86400;
    const timestamp7dayAgo = now - 86400 * 7;
    const block1dayAgoCall = axios.get(
        `https://coins.llama.fi/block/${CHAIN}/${timestamp1dayAgo}`
    );
    const block7dayAgoCall = axios.get(
        `https://coins.llama.fi/block/${CHAIN}/${timestamp7dayAgo}`
    );

    const calls = [
        totalSupplyCall,
        decimalsCall,
        underlyingPriceCall,
        currentRateCall,
        block1dayAgoCall,
        block7dayAgoCall,
    ];

    const [
        totalSupplyResponse,
        decimalsResponse,
        underlyingPriceResponse,
        currentRateResponse,
        block1dayAgoResponse,
        block7dayAgoResponse,
    ] = await Promise.all(calls);

    const decimals = decimalsResponse.output;
    const scalingFactor = 10 ** decimals;
    const totalSupply = totalSupplyResponse.output / scalingFactor;
    const underlyingPrice = underlyingPriceResponse.data.coins[priceKey].price;
    const currentRate = currentRateResponse.output;
    const tvlUsd =
        totalSupply * (currentRate / scalingFactor) * underlyingPrice;

    const block1dayAgo = block1dayAgoResponse.data.height;
    const block7dayAgo = block7dayAgoResponse.data.height;

    const [rate1dayAgo, rate7dayAgo] = await Promise.all([
        sdk.api.abi.call({
            target: hwHLP_ACCOUNTANT,
            abi: Accountant.find((m) => m.name === "getRate"),
            block: block1dayAgo,
        }),
        sdk.api.abi.call({
            target: hwHLP_ACCOUNTANT,
            abi: Accountant.find((m) => m.name === "getRate"),
            block: block7dayAgo,
        }),
    ]);
    const apr1d =
        ((currentRate - rate1dayAgo.output) / scalingFactor) * 365 * 100;

    const apr7d =
        ((currentRate - rate7dayAgo.output) / scalingFactor / 7) * 365 * 100;

    return [
        {
            pool: hwHLP,
            project: "hyperwave",
            chain: CHAIN,
            symbol: "hwHLP",
            tvlUsd: tvlUsd,
            apyBase: apr1d,
            apyBase7d: apr7d,
            underlyingTokens: [UNDERLYING],
        },
    ];
};

module.exports = {
    apy,
    timetravel: false,
    url: "https://app.hyperwavefi.xyz/assets/hwhlp",
};
