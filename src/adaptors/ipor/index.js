const superagent = require('superagent');
const sdk = require("@defillama/sdk");
const {liquidityMiningAbi} = require('./abi')

const LP_STATS_URL = "https://api.ipor.io/monitor/liquiditypool-statistics";
const COIN_PRICES_URL = "https://coins.llama.fi/prices";

const LM_ADDRESS = "0xCC3Fc4C9Ba7f8b8aA433Bc586D390A70560FF366";
const IPOR_TOKEN = "0x1e4746dc744503b53b4a082cb3607b169a289090";

const BLOCKS_PER_YEAR = 365 * 24 * 3600 / 12;

const apy = async () => {

        const assets = (await superagent.get(LP_STATS_URL)).body.assets;
        const coinKeys = assets.map((assetData) => "ethereum:" + assetData.assetAddress);
        coinKeys.push('ethereum:' + IPOR_TOKEN);
        const coinPrices = (await superagent.post(COIN_PRICES_URL).send({coins: coinKeys})).body.coins;
        const iporTokenUsdPrice = coinPrices["ethereum:" + IPOR_TOKEN].price;

        const lpTokenAddresses = assets.map((assetData) => assetData.ipTokenAssetAddress);

        const globalStats = new Map((
            await sdk.api.abi.multiCall({
                abi: liquidityMiningAbi.find(({name}) => name === "getGlobalIndicators"),
                calls: lpTokenAddresses.map((lpTokenAddress) => ({
                    target: LM_ADDRESS,
                    params: lpTokenAddress,
                }))
            })
        ).output.map(stats => [stats.input.params[0].toLowerCase(), stats.output]));

        const stakedLpTokens = new Map((
            await sdk.api.abi.multiCall({
                abi: 'erc20:balanceOf',
                calls: lpTokenAddresses.map((lpTokenAddress) => ({
                    target: lpTokenAddress,
                    params: LM_ADDRESS
                }))
            })
        ).output.map(balance => [balance.input.target.toLowerCase(), balance.output]));

        const pools = [];

        for (const asset of assets) {
            const lpApr = asset.periods.find(({period}) => period === "MONTH").ipTokenReturnValue;
            const coinPrice = coinPrices["ethereum:" + asset.assetAddress.toLowerCase()].price;
            const lpBalanceHistory = asset.periods.find(({period}) => period === "HOUR").totalLiquidity;
            const lpBalance = lpBalanceHistory[lpBalanceHistory.length - 1].totalLiquidity;
            const lpTokenPriceHistory = asset.periods.find(({period}) => period === "HOUR").ipTokenExchangeRates;
            const lpTokenPrice = lpTokenPriceHistory[lpTokenPriceHistory.length - 1].exchangeRate;
            const liquidityMiningGlobalStats = globalStats.get(asset.ipTokenAssetAddress.toLowerCase());
            const staked = stakedLpTokens.get(asset.ipTokenAssetAddress.toLowerCase()) / 1e18;
            const apyReward = (liquidityMiningGlobalStats.rewardsPerBlock / 1e8)
                / staked
                * BLOCKS_PER_YEAR
                * iporTokenUsdPrice
                / lpTokenPrice
                * 100; //percentage

            pools.push({
                pool: asset.assetAddress + "-ethereum",
                chain: "Ethereum",
                project: "ipor",
                symbol: asset.asset,
                tvlUsd: lpBalance * coinPrice,
                apyBase: Number(lpApr),
                apyReward: Number(apyReward),
                underlyingTokens: [asset.assetAddress],
            });
        }

        return pools;
    }
;

module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://app.ipor.io/pools',
};
