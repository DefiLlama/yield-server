const axios = require("axios");

const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const getCats = async () => {
    const apyData = (await axios.get("https://catinabox.finance/cats")).data;
    const priceKey = `ethereum:${weth}`;
    const ethPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;
    return  [{
        pool: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum",
        chain: "Ethereum",
        project: "cat-in-a-box",
        symbol: "stETH",
        tvlUsd: apyData.tvl * ethPrice,
        apyBase: apyData.apyBase
    }];
};

module.exports = {
    timetravel: false,
    apy: getCats,
    url: "https://catinabox.finance/",
};

