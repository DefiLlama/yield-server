const utils = require('../utils');

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';

const FARMING_TYPE = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve_config::DepositFarming";
const APT_ADDR = "0x1::aptos_coin::AptosCoin";
const APT_PRICE_ID = 'coingecko:aptos';

const SUPPORTED_COINS = [
    ["usdc", "coingecko:usd-coin", 6, "0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T"],
    ["zusdc", "coingecko:usd-coin", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC"],
    ["zusdt", "coingecko:tether", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT"],
    ["zweth", "coingecko:ethereum", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH"],
    ["stApt", "coingecko:amnis-staked-aptos-coin", 8, "0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt"],
    ["cake", "coingecko:pancakeswap-token", 8, "0x159df6b7689437016108a019fd5bef736bac692b6d4a1f10c941f6fbb9a74ca6::oft::CakeOFT"],
    ["apt", APT_PRICE_ID, 8, APT_ADDR],
]

async function main() {
    let aptPrice = 0
    try {
        const aptRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${APT_PRICE_ID}`)
        aptPrice = aptRes?.coins?.[APT_PRICE_ID]?.price ?? 0
    } catch (error) {
        console.warn(`[aries-markets] failed to fetch APT price: ${error.message ?? error}`)
    }
    let res
    try {
        ({result: res } = await utils.getData(`https://api-v2.ariesmarkets.xyz/reserve.current`))
    } catch (error) {
        console.warn(`[aries-markets] failed to fetch reserve stats: ${error.message ?? error}`)
        return []
    }
    const reserveStats = res?.data?.stats ?? []
    const reserveStatsMap = new Map(reserveStats.map(({ key, value }) => [key, value]));

    const pools = await Promise.all(
        SUPPORTED_COINS.map(async (coin) => await calculateRewardApy(coin, reserveStatsMap, aptPrice))
    )
    return pools.filter(Boolean)
}

async function calculateRewardApy(coin, reserveStatsMap, aptPrice) {
    const [coinSymbol, priceId, coinDecimal, coinAddr] = coin;
    const reserveStat = reserveStatsMap.get(coinAddr);
    if (!reserveStat) {
        console.warn(`[aries-markets] missing reserve stats for ${coinSymbol} (${coinAddr})`)
        return null
    }

    const coinPrice = await getCoinPrice(priceId, coinAddr)
    if (!coinPrice) console.warn(`[aries-markets] missing price for ${coinSymbol} (${coinAddr})`)

    const [netTvl, tvlWithBorrow] = calcTvlUSD(reserveStat, coinDecimal, coinPrice);
    const interestApy = calcInterestApy(reserveStat);
    const res = {
        pool: `aries-markets-${coinSymbol}`,
        chain: utils.formatChain('aptos'),
        project: 'aries-markets',
        symbol: coinSymbol,
        tvlUsd: netTvl,
        apyBase: interestApy,
        underlyingTokens: [coinAddr],
    }

    try {
        const farmingData = await utils.getData(`${NODE_URL}/view`, {
            "type_arguments": [
              coinAddr,
              FARMING_TYPE,
              APT_ADDR
            ],
            "function": "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve::reserve_farm_coin", 
            "arguments": []
          });
        const remainingReward = Number(farmingData?.[2] ?? 0)
        const rewardPerDay = Number(farmingData?.[3] ?? 0)

        if (remainingReward > 0 && tvlWithBorrow > 0) {
            const rewardApy = calcAptRewardApy(rewardPerDay / 1e8, aptPrice, tvlWithBorrow);
            res['apyReward'] = rewardApy;
            res['rewardTokens'] = [APT_ADDR];
        }
    } catch (error) {
        console.warn(`[aries-markets] failed to fetch farming rewards for ${coinSymbol}: ${error.message ?? error}`)
    }

    return res;
}

async function getCoinPrice(priceId, coinAddr) {
    let coinPrice = 0

    try {
        const priceRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${priceId}`)
        coinPrice = priceRes?.coins?.[priceId]?.price ?? 0
    } catch (error) {
        console.warn(`[aries-markets] failed to fetch price ${priceId}: ${error.message ?? error}`)
    }

    if (!coinPrice) {
        try {
            const aptosPriceId = `aptos:${coinAddr}`
            const aptosPriceRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosPriceId}`)
            coinPrice = aptosPriceRes?.coins?.[aptosPriceId]?.price ?? 0
        } catch (error) {
            console.warn(`[aries-markets] failed to fetch aptos price for ${coinAddr}: ${error.message ?? error}`)
        }
    }
    return Number(coinPrice ?? 0)
}

function toNumber(value) {
    return Number(value ?? 0)
}

function calcInterestApy(data = {}) {
    const interestRateConfig = data["interest_rate_config"] ?? {};
    const reserveConfig = data['reserve_config'] ?? {};
    const totalBorrowed = toNumber(data['total_borrowed'])
    const totalCashAvailable = toNumber(data['total_cash_available'])
    const reserveAmount = toNumber(data['reserve_amount'])
    const optimalUtilization = toNumber(interestRateConfig['optimal_utilization'])
    const totalLiquidity = totalBorrowed + totalCashAvailable + reserveAmount
    if (totalLiquidity <= 0 || optimalUtilization <= 0) return 0

    const utilizationPct = totalBorrowed / totalLiquidity * 100
    let borrowApy = 0
    if (utilizationPct <= optimalUtilization) {
        borrowApy = toNumber(interestRateConfig['min_borrow_rate']) + utilizationPct / optimalUtilization * (toNumber(interestRateConfig['optimal_borrow_rate']) - toNumber(interestRateConfig['min_borrow_rate']) )
    } else {
        borrowApy = toNumber(interestRateConfig['optimal_borrow_rate']) + (utilizationPct - optimalUtilization) / optimalUtilization * (toNumber(interestRateConfig['max_borrow_rate']) - toNumber(interestRateConfig['optimal_borrow_rate']) )
    }
    return borrowApy * utilizationPct * (100 - toNumber(reserveConfig['reserve_ratio'])) / 10000;
}

function calcTvlUSD(data = {}, decimals, price) {
    const totalCashAvailable = toNumber(data['total_cash_available'])
    const reserveAmount = toNumber(data['reserve_amount'])
    const totalBorrowed = toNumber(data['total_borrowed'])
    const netTvl = (totalCashAvailable + reserveAmount) * price / (10 ** decimals);
    const tvlwithBorrow = totalBorrowed * price / (10 ** decimals) + netTvl;
    return [netTvl, tvlwithBorrow]
}

function calcAptRewardApy(rewardPerDay, aptPrice, tvlWithBorrow) {
    return rewardPerDay * 365 * aptPrice / tvlWithBorrow * 100
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.ariesmarkets.xyz',
};
