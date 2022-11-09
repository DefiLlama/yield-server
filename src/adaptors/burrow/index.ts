const axios = require('axios');

async function commonCall(url, method, args = {}) {
    const result = await axios({
        method: 'get',
        url: url + method,
        params: args,
    });
    if (result.data.error) {
        throw new Error(`${result.data.error.message}: ${result.data.error.data}`);
    }
    return result.data;
}

function getBurrowStats() {
    return commonCall("https://brrr.burrow.cash/api/rewards", '');
}

async function getBurrowFarms() {
    const target_list = [];
    (await getBurrowStats()).map(item => {
        const target = {
            pool: 'burrow-pool-' + item.token_id,
            chain: 'NEAR',
            project: 'burrow',
            symbol: item.symbol,
            tvlUsd: item.tvlUsd,
            apyReward: item.apyReward + item.apyRewardTvl,
            apyBase: item.apyBase,
            underlyingTokens: [item.token_id],
            rewardTokens: item.rewardTokens,
            apyBaseBorrow: item.apyBaseBorrow,
            totalSupplyUsd: item.totalSupplyUsd,
            totalBorrowUsd: item.totalBorrowUsd,
            ltv: item.ltv
        };
        target_list.push(target);
    })
    return target_list;
}

module.exports = {
    timetravel: false,
    apy: getBurrowFarms,
    url: 'https://app.burrow.cash/deposit/',
};
