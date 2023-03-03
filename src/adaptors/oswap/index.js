const utils = require('../utils');

const OSWAP_STATS_ENDPOINT = 'https://v2-stats.oswap.io/api/v1';
const LIQUIDITY_PROVIDER_ENDPOINT = 'https://liquidity.obyte.org';
const COMMON_DATA = { chain: "Obyte", project: 'oswap' };

const poolsFunction = async () => {
    const poolsData = await utils.getData(
        `${OSWAP_STATS_ENDPOINT}/yield`
    );

    const apyRewards = await utils.getData(
        `${LIQUIDITY_PROVIDER_ENDPOINT}/mining-apy`
    );

    return poolsData.map(({ address, pool, ...rest }) => ({
        url: `https://oswap.io/#/swap/${address}`,
        apyReward: apyRewards[address] || 0,
        rewardTokens: ['GBYTE'],
        pool: `${address}-obyte`.toLowerCase(),
        ...rest,
        ...COMMON_DATA
    }));
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
};