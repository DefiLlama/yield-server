

async function getData () {
    const res = await fetch("https://gmd-stats-backend.vercel.app/getTvlAndApr", {
        method: 'GET',
        headers: {
            "Content-type": "application/json"
        },
        credentials: "include",
    });
    return {
        usdcPool: {
            tvl: res.tvl.usdc,
            apy: res.apy.usdc
        },
        ethPool: {
            tvl: res.tvl.eth,
            apy: res.apy.eth
        },
        btcPool: {
            tvl: res.tvl.btc,
            apy: res.apy.btc
        }
    };
}

module.exports = {
  timetravel: false,
  apy: getData,
  url: 'https://gmdprotocol.com/',
};
