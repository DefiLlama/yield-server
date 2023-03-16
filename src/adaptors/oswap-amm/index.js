const utils = require('../utils');

const OSWAP_STATS_ENDPOINT = 'https://v2-stats.oswap.io/api/v1';
const LIQUIDITY_PROVIDER_ENDPOINT = 'https://liquidity.obyte.org';
const COMMON_DATA = { chain: 'Obyte', project: 'oswap-amm' };

const poolsFunction = async () => {
  const poolsData = await utils.getData(`${OSWAP_STATS_ENDPOINT}/yield`);

  const apyRewards = await utils.getData(
    `${LIQUIDITY_PROVIDER_ENDPOINT}/mining-apy`
  );

  return poolsData
    .map(({ address, pool, apyBase, ...rest }) => ({
      url: `https://oswap.io/#/swap/${address}`,
      apyReward: apyRewards[address] || null,
      apyBase,
      rewardTokens: ['GBYTE'],
      pool: `${address}-obyte`.toLowerCase(),
      ...rest,
      ...COMMON_DATA,
    }))
    .filter(({ apyBase }) => apyBase !== null)
    .filter((p) => p.symbol !== 'O-GBYTE-WBTC-WBTC');
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
