const axios = require("axios");

const getCats = async () => {
    const apyData = (await axios.get("https://catinabox.finance/cats")).data;
    return  [{
        pool: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum-cat-in-a-box",
        chain: "Ethereum",
        project: "cat-in-a-box",
        symbol: "stETH",
        tvlUsd: apyData["tvl-usd"],
        apyBase: apyData["apyBase"]
    }];
};

module.exports = {
    timetravel: false,
    apy: getCats,
    url: "https://catinabox.finance/",
};
