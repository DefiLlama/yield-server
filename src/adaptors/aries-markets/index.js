const utils = require('../utils');

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';

const coins = [
    ["usdc", "coingecko:usd-coin", 6, "0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T"],
    ["zusdc", "coingecko:usd-coin", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC"],
    ["zusdt", "coingecko:tether", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT"],
    ["zweth", "coingecko:ethereum", 6, "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH"],
    ["stApt", "coingecko:amnis-staked-aptos-coin", 6, "0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt"],
    ["cake", "coingecko:pancakeswap-token", 8, "0x159df6b7689437016108a019fd5bef736bac692b6d4a1f10c941f6fbb9a74ca6::oft::CakeOFT"],
]

const FARMING_TYPE = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve_config::DepositFarming";
const APT_ADDR = "0x1::aptos_coin::AptosCoin";
const aptosCoinName = 'coingecko:aptos';

async function main() {
    const aptRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosCoinName}`)
    const aptPrice = aptRes['coins'][aptosCoinName]['price']
    const {result: res } = await utils.getData(`https://api-v2.ariesmarkets.xyz/reserve.current`)
    const reserveStats = res['data']['stats']
    const reserveStatsMap = new Map(reserveStats.map(({ key, value }) => [key, value]));

    return await Promise.all(coins.map(async (coin) => await calculateRewardApy(coin, reserveStatsMap, aptPrice)));
}

async function calculateRewardApy(coin, reserveStatsMap, aptPrice) {
    const [coinSymbol, priceId, coinDecimal, coinAddr] = coin;
    const reserveStat = reserveStatsMap.get(coinAddr);
    const priceRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${priceId}`)
    const coinPrice = priceRes['coins'][priceId]['price']

    const [_1, _2, remainingReward, rewardPerDay] = await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, {
        "type_arguments": [
          coinAddr,
          FARMING_TYPE,
          APT_ADDR
        ],
        "function": "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve::reserve_farm_coin", 
        "arguments": []
      });
    const tvlUsd = calcTvlUSD(reserveStat, coinDecimal, coinPrice);
    const interestApy = calcInterestApy(reserveStat);
    const rewardApy = calcAptRewardApy(rewardPerDay / 1e8, aptPrice, tvlUsd);
    return {
        pool: `aries-markets-${coinSymbol}`,
        chain: utils.formatChain('aptos'),
        project: 'aries-markets',
        symbol: utils.formatSymbol(coinSymbol),
        tvlUsd: tvlUsd,
        apyBase: interestApy,
        apyReward: remainingReward > 0 ? rewardApy: 0,
        rewardTokens: [APT_ADDR]
    }
}

function calcInterestApy(data) {
    const interestRateConfig = data["interest_rate_config"];
    const totalLiquidity = data['total_borrowed'] + data['total_cash_available'] + data['reserve_amount'];
    const utilizationPct = data['total_borrowed'] / totalLiquidity * 100
    let borrowApy = 0
    if (utilizationPct <= interestRateConfig['optimal_utilization']) {
        borrowApy = interestRateConfig['min_borrow_rate'] + utilizationPct / interestRateConfig['optimal_utilization'] * (interestRateConfig['optimal_borrow_rate'] - interestRateConfig['min_borrow_rate'] )
    } else {
        borrowApy = interestRateConfig['optimal_borrow_rate'] + (utilizationPct - interestRateConfig['optimal_utilization']) / interestRateConfig['optimal_utilization'] * (interestRateConfig['max_borrow_rate'] - interestRateConfig['optimal_borrow_rate'] )
    }
    return borrowApy * utilizationPct * (100 - data['reserve_config']['reserve_ratio']) / 10000;
}

function calcTvlUSD(data, decimals, price) {
    return (data['total_borrowed'] + data['total_cash_available'] + data['reserve_amount']) * price / (10 ** decimals)
}

function calcAptRewardApy(rewardPerDay, aptPrice, tvlInUsd) {
    return rewardPerDay * 365 * aptPrice / tvlInUsd * 100
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.ariesmarkets.xyz',
};