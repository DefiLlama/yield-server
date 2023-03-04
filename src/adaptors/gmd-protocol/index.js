const fetch = require("node-fetch")
// import fetch from "node-fetch";

const getData = async () => {
    let res = await fetch("https://gmd-stats-backend.vercel.app/getTvlAndApy", {
        method: 'GET',
        headers: {
            "Content-type": "application/json"
        },
        credentials: "include",
    });
    const fee = 1 - 0.5/100;
    res = await res.json();
    
    apy = [
        {
            pool: "0x8080B5cE6dfb49a6B86370d6982B3e2A86FBBb08",
            chain: "Arbitrum",
            project: "gmd-protocol",
            symbol: "gmdUSDC",
            tvlUsd: res.tvl.usdc,
            apyBase: res.apy.usdc*fee
        },
        {
            pool: "0x8080B5cE6dfb49a6B86370d6982B3e2A86FBBb08",
            chain: "Arbitrum",
            project: "gmd-protocol",
            symbol: "gmdETH",
            tvlUsd: res.tvl.eth,
            apyBase: res.apy.eth*fee
        },
        {
            pool: "0x8080B5cE6dfb49a6B86370d6982B3e2A86FBBb08",
            chain: "Arbitrum",
            project: "gmd-protocol",
            symbol: "gmdBTC",
            tvlUsd: res.tvl.btc,
            apyBase: res.apy.btc*fee
        }
    ];
    // apy.forEach((pool) => {
    //     console.log(pool);
    // });
    return apy;
}





module.exports = {
  timetravel: false,
  apy: getData,
  url: 'https://gmdprotocol.com/',
};
