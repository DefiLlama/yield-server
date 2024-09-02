// @see https://kava.obyte.org

const sdk = require('@defillama/sdk');
const { default: axios } = require('axios');
const BigNumber = require('bignumber.js');
const { ethers } = require('ethers');
const { startOfMonth, endOfMonth } = require('date-fns');

const { LLAMA_API_URL, BACKEND_API_URL, CHAIN, REWARD_TOKEN, MONTHLY_TOTAL_REWARDS_IN_KAVA, DISTRIBUTION_SHARE, PROJECT } = require('./config.js');

const apy = async () => {
    const period = Date.now();
    const periodStart = Math.floor(startOfMonth(period).getTime() / 1000);
    const periodEnd = Math.floor((endOfMonth(period).getTime() + 1) / 1000);

    const [csTvl, lineTvl, kavaGlobalTvl] = await Promise.all([
        axios.get(`${LLAMA_API_URL}/protocol/counterstake`).then(data => data.data.chainTvls.Kava.tvl || []),
        axios.get(`${LLAMA_API_URL}/protocol/line-token`).then(data => data.data.chainTvls.Kava.tvl || []),
        axios.get(`${LLAMA_API_URL}/v2/historicalChainTvl/Kava`).then(data => data.data),
    ]);

    const csFilteredTvl = csTvl.filter((tvl) => tvl.date >= periodStart && tvl.date <= periodEnd);
    const csAvgTvlInUsd = csFilteredTvl.reduce((acc, { totalLiquidityUSD }) => acc + totalLiquidityUSD, 0) / csFilteredTvl.length;

    const lineFilteredTvl = lineTvl.filter((tvl) => tvl.date >= periodStart && tvl.date <= periodEnd);
    const lineAvgTvlInUSD = lineFilteredTvl.reduce((acc, { totalLiquidityUSD }) => acc + totalLiquidityUSD, 0) / lineFilteredTvl.length;

    const kavaFilteredGlobalTvl = kavaGlobalTvl.filter((tvl) => tvl.date >= periodStart && tvl.date <= periodEnd);
    const kavaAvgTvlInUsd = kavaFilteredGlobalTvl.reduce((acc, { tvl }) => acc + tvl, 0) / kavaFilteredGlobalTvl.length;

    const totalTvlInUsd = lineAvgTvlInUSD + csAvgTvlInUsd;
    const projectsTvlShare = totalTvlInUsd / kavaAvgTvlInUsd;

    const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/Kava:${ethers.constants.AddressZero}`)
    ).data.coins;

    const kavaPriceInUsd = prices[`Kava:${ethers.constants.AddressZero}`]?.price;

    const totalRewardsInKava = MONTHLY_TOTAL_REWARDS_IN_KAVA * projectsTvlShare * DISTRIBUTION_SHARE;

    const totalMonthlyRewardInUSD = kavaPriceInUsd * totalRewardsInKava;

    const avgBalances = (
        await axios.get(`${BACKEND_API_URL}/average_balances/latest`)
    ).data.data;

    const avgTotalEffectiveBalanceInUsd = avgBalances.reduce((currentValue, { effective_usd_balance }) => {
        return currentValue + effective_usd_balance;
    }, 0);

    const avgTotalBalanceInUsd = avgBalances.reduce((currentValue, { effective_usd_balance = 0, home_symbol }) => {
        return currentValue + (effective_usd_balance / (home_symbol === "LINE" ? 2 : 1));
    }, 0);

    const totalBalanceOfLineTokensInUsd = (avgTotalEffectiveBalanceInUsd - avgTotalBalanceInUsd);

    const totalRewardForLineTokens = totalMonthlyRewardInUSD * (totalBalanceOfLineTokensInUsd / avgTotalBalanceInUsd);

    return [{
        chain: CHAIN,
        project: PROJECT,
        rewardTokens: [REWARD_TOKEN],
        apyReward: null,
        apyBase: ((1 + (totalRewardForLineTokens / totalBalanceOfLineTokensInUsd)) ** 12 - 1) * 100,
        tvlUsd: totalBalanceOfLineTokensInUsd,
        pool: `LINE-${CHAIN}`.toLowerCase(),
        symbol: 'LINE',
    }]
}

module.exports = {
    timetravel: false,
    url: 'https://kava.obyte.org',
    apy,
};
