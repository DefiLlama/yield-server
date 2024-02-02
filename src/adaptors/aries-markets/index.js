const utils = require('../utils');

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';

const coins = [
    ["usdc", "0x5e156f1207d0ebfa19a9eeff00d62a282278fb8719f4fab3a586a0a2c0fffbea::coin::T"],
    ["zusdc", "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC"],
    ["zusdt", "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT"],
]

const FARMING_TYPE = "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve_config::DepositFarming";
const APT_ADDR = "0x1::aptos_coin::AptosCoin";
const aptosCoinName = 'coingecko:aptos';

async function main() {
    const aptRes = await utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosCoinName}`)
    const aptPrice = aptRes['coins']['coingecko:aptos']['price']
    const {result: res } = await utils.getData(`https://api-v2.ariesmarkets.xyz/reserve.current`)
    const reserveStats = res['data']['stats']
    const reserveStatsMap = new Map(reserveStats.map(({ key, value }) => [key, value]));

    return await Promise.all(coins.map(async (coin) => await calculateRewardApy(coin, reserveStatsMap, aptPrice)));
}

async function calculateRewardApy(coin, reserveStatsMap, aptPrice) {
    const [coinSymbol, coinAddr] = coin;
    const reserveStat = reserveStatsMap.get(coinAddr);
    const [_1, _2, _3, rewardPerDay] = await utils.getData(`https://fullnode.mainnet.aptoslabs.com/v1/view`, {
        "type_arguments": [
          coinAddr,
          FARMING_TYPE,
          APT_ADDR
        ],
        "function": "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve::reserve_farm_coin", 
        "arguments": []
      });

    const tvlUsd = calcTvlUSD(reserveStat, 6, 1);
    const interestApy = calcInterestApy(reserveStat);
    const rewardApy = calcAptRewardApy(rewardPerDay / 1e8, aptPrice, tvlUsd);

    return {
        pool: `aries-markets-${coinSymbol}`,
        chain: utils.formatChain('aptos'),
        project: 'aries-markets',
        symbol: utils.formatSymbol(coinSymbol),
        tvlUsd: tvlUsd,
        apy: interestApy + rewardApy,
        apyBase: interestApy + rewardApy,
    }
}

function calcInterestApy(data) {
    const interestRateConfig = data["interest_rate_config"];
    const utilization = data['total_borrowed'] / (data['total_borrowed'] + data['total_cash_available'] + data['reserve_amount']) * 100
    let borrowApy = 0
    if (utilization <= interestRateConfig['optimal_utilization']) {
        borrowApy = interestRateConfig['min_borrow_rate'] + utilization / interestRateConfig['optimal_utilization'] * (interestRateConfig['optimal_borrow_rate'] - interestRateConfig['min_borrow_rate'] )
    } else {
        borrowApy = interestRateConfig['optimal_borrow_rate'] + (utilization - interestRateConfig['optimal_utilization']) / interestRateConfig['optimal_utilization'] * (interestRateConfig['max_borrow_rate'] - interestRateConfig['optimal_borrow_rate'] )
    }
    return borrowApy * utilization / 100;
}

function calcTvlUSD(data, decimals, price) {
    return (data['total_borrowed'] + data['total_cash_available'] + data['reserve_amount']) * 1 / (10 ** decimals)
}

function calcAptRewardApy(rewardPerDay, price, tvlInUsd) {
    return rewardPerDay * 365 * price / tvlInUsd * 100
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.ariesmarkets.xyz',
};