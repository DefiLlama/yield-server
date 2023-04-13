const utils = require('../utils');

const OSWAP_STATS_ENDPOINT = 'https://v2-stats.oswap.io/api/v1';
const LIQUIDITY_PROVIDER_ENDPOINT = 'https://liquidity.obyte.org';
const OSWAP_TOKEN_ENDPOINT = 'https://token.oswap.io/api'; //@see https://token.oswap.io/farming/all

const COMMON_DATA = { chain: 'Obyte', project: 'oswap-amm' };

const poolsFunction = async () => {
  const poolsData = await utils.getData(`${OSWAP_STATS_ENDPOINT}/yield`);

  const apyRewards = await utils.getData(
    `${LIQUIDITY_PROVIDER_ENDPOINT}/mining-apy`
  );

  const farmingPoolsAPY = await utils.getData(`${OSWAP_TOKEN_ENDPOINT}/lp_apy`)?.then((data) => data?.data);

  return poolsData
    .map(({ address, pool, apyBase, ...rest }) => {
      const farmingAPY = +(farmingPoolsAPY.find((pool) => address === pool.address)?.apy || 0);
      let apyReward = apyRewards[address] || null;

      if (!apyReward || farmingAPY && (farmingAPY > apyReward)) {
        apyReward = farmingAPY;
      }

      return ({
        url: `https://oswap.io/#/swap/${address}`,
        apyReward,
        apyBase,
        rewardTokens: ['GBYTE'],
        pool: `${address}-obyte`.toLowerCase(),
        ...rest,
        ...COMMON_DATA,
      })
    })
    .filter(({ apyBase }) => apyBase !== null)
    .filter((p) => p.symbol !== 'O-GBYTE-WBTC-WBTC');
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
