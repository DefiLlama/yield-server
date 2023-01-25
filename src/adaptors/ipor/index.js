const superagent = require('superagent');

const LP_STATS_URL = "https://api.ipor.io/monitor/liquiditypool-statistics";
const COIN_PRICES_URL = "https://coins.llama.fi/prices";

const apy = async () => {

    const assets = (await superagent.get(LP_STATS_URL)).body.assets;
    const coinKeys = assets.map((assetData) => "ethereum:" + assetData.assetAddress);
    const coinPrices = (await superagent.post(COIN_PRICES_URL).send({coins: coinKeys})).body.coins;

    const pools = [];

    for (const asset of assets) {
        const lpApr = asset.periods.find(({period}) => period === "MONTH").ipTokenReturnValue;
        const coinPrice = coinPrices["ethereum:" + asset.assetAddress.toLowerCase()].price;
        const lpBalanceHistory = asset.periods.find(({period}) => period === "HOUR").totalLiquidity;
        const lpBalance = lpBalanceHistory[lpBalanceHistory.length - 1].totalLiquidity;

        pools.push({
            pool: asset.assetAddress + "-ethereum",
            chain: "Ethereum",
            project: "ipor",
            symbol: asset.asset,
            tvlUsd: lpBalance * coinPrice,
            apyBase: Number(lpApr),
            apyReward: null,
            underlyingTokens: [asset.assetAddress],
        });
    }

    return pools;
};

module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://app.ipor.io/pools',
};
