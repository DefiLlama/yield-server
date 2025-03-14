const axios = require('axios');
const utils = require('../utils');

const CHAINS = {
  bsc: 'bsc',
  linea: 'linea',
  base: 'base',
};

const POOLS_PAGE = 'https://clip.finance/earn';

const getUrl = (path, queries) =>
  `https://stats-kixqx.ondigitalocean.app/${path}${queries}`;

const getPoolsApy = async () => {
  const pools = [];

  // const poolsData = pairsToObj(
  await Promise.all(
    Object.keys(CHAINS).map(async (chain) => {
      const apyResponse = await axios.get(
        getUrl('pools-apy', `?chain=${CHAINS[chain]}`)
      );
      const tvlResponse = await axios.get(
        getUrl('pools-tvl', `?chain=${CHAINS[chain]}`)
      );

      const apyResponseData = apyResponse?.data;
      const tvlResponseData = tvlResponse?.data;

      if (tvlResponseData?.status === 'pools_tvl_calculated') {
        Object.keys(tvlResponseData.data).forEach((pool) => {
          const poolData = tvlResponseData.data[pool];

          const poolTvlSuccess =
            poolData?.status === 'pool_tvl_calculated' &&
            poolData?.tvlUsd !== 0;

          const poolApySuccess =
            apyResponseData?.status === 'pools_apy_calculated' &&
            apyResponseData?.data?.[pool]?.status === 'pool_apy_calculated';

          const poolTotalApy = poolApySuccess
            ? Number(apyResponseData.data[pool].apyTotal)
            : 0;

          if (poolTvlSuccess) {
            const poolObj = {
              pool: `${poolData.poolAddress}-${chain}`.toLowerCase(),
              chain: utils.formatChain(chain),
              project: 'clip-finance',
              symbol: poolData.tokensSymbols?.map((symbol) => symbol).join('-'),
              tvlUsd: poolData.tvlUsd,
              apy: poolTotalApy,
              underlyingTokens: poolData.underlyingTokens,
              url: `${POOLS_PAGE}/${pool}`,
            };

            // add reward and base APYs if reward token exists
            if (!!apyResponseData?.data?.[pool]?.rewardTokenAddress) {
              const rewardToken = apyResponseData.data[pool].rewardTokenAddress;
              poolObj.rewardTokens = [rewardToken];
              poolObj.apyReward = Number(apyResponseData.data[pool].rewardApy);
              poolObj.apyBase = Number(apyResponseData.data[pool].feeApy);
            }

            pools.push(poolObj);
          }
        });
      }
    })
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPoolsApy,
  url: POOLS_PAGE,
};
