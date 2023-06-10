const utils = require('../utils');

const listOfPools = [{
    address: "0x561920028545985c60fb93d48717ff0070cb4e74",
    tokenAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    symbol: "WETH",
    url: "https://app.atomic.green/reserve/42161/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
}, {
    address: "0xc1b677039892C048f2eFb7E9C5da1B51fDE92504",
    tokenAddress: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    symbol: "USDC",
    url: "https://app.atomic.green/reserve/42161/0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
}, {
    address: "0xBAE99752dA245089698Bc1b5F0a14eAE91694FBc",
    tokenAddress: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    symbol: "WBTC",
    url: "https://app.atomic.green/reserve/42161/0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"
},];

const poolsFunction = async () => {
    const apyData = await utils.getData(
        'https://info.atomic.green/lending/42161/apyInfo',
    );

    const response = [];

    for (let i = 0; i < listOfPools.length; i++) {
        const poolInfo = listOfPools[i];
        let poolApyData = apyData.find(item => item.pool === poolInfo.address.toLowerCase());
        if (!poolApyData) {
            poolApyData = {
                tvl: 0,
                apy: 0
            }
        }

        response.push({
            pool: `${poolInfo.address.toLowerCase()}-arbitrum`,
            chain: "Arbitrum",
            project: "atomic-green",
            symbol: poolInfo.symbol,
            tvlUsd: parseFloat(poolApyData.tvl),
            apyBase: 0.2,
            apyReward: parseFloat(poolApyData.apy),
            rewardTokens: [poolInfo.tokenAddress],
            underlyingTokens: [poolInfo.tokenAddress],
            poolMeta: "Atomic lending pool"

        })
    }

    return response; // Anchor only has a single pool with APY
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://app.atomic.green/dashboard',
};
