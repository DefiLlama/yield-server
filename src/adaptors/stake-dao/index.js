const utils = require('../utils');

const API_ENDPOINT = 'https://api.stakedao.org/api/';
const SDT_ADDRESS = '0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f';

const CHAINS = {
  1: 'ethereum',
  42161: 'arbitrum',
  56: 'bsc',
  252: 'fraxtal',
  10: 'optimism',
  8453: 'base',
  146: 'sonic',
  42793: 'etherlink',
};

const poolsFunction = async () => {
  const resp = await Promise.all([
    // Strategies v1
    utils.getData(`${API_ENDPOINT}strategies/pendle`),
    utils.getData(`${API_ENDPOINT}strategies/balancer`),
    utils.getData(`${API_ENDPOINT}strategies/yearn`),
    // Strategies v2
    utils.getData(`${API_ENDPOINT}strategies/v2/curve`),
    // Lockers
    utils.getData(`${API_ENDPOINT}lockers`),
  ]);

  const pendleStrategies = resp[0].deployed;
  const balancerStrategies = resp[1].deployed;
  const yearnStrategies = resp[2].deployed;

  const v2CurveStrategies = resp[3];

  const strats = v2CurveStrategies
    .concat(pendleStrategies)
    .concat(balancerStrategies)
    .concat(yearnStrategies)
    .reduce((acc, strat) => {
      const rewardTokens = strat?.rewards
        ?.filter((t) => {
          if (t.token.address === SDT_ADDRESS) {
            return parseFloat(strat.sdtApr.sdtFuturMinApr) > 0;
          }

          return t.apr > 0;
        })
        .map((t) => t.token.address);

      // strategies APR
      const apyBase =
        strat.tradingApy +
        (strat.underlyingReward?.reduce(
          (acc, underlyingReward) => acc + underlyingReward.apy,
          0
        ) || 0);
      const apyReward = strat.apr.current.total - apyBase;

      let symbol = strat.name?.replace('/', '-') ?? ['placeholder'];

      const underlyingTokens = strat?.coins?.map((t) =>
        t?.symbol === 'ETH'
          ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
          : t?.address
      );

      return acc.concat([
        {
          pool: `sd-${strat.key}-${CHAINS[strat.chainId]}`,
          chain: utils.formatChain(CHAINS[strat.chainId]),
          project: 'stake-dao',
          symbol: symbol ? utils.formatSymbol(symbol) : null,
          poolMeta: strat.protocol ? utils.formatChain(strat.protocol) : null,
          tvlUsd: strat.tvl,
          apyReward,
          apyBase,
          rewardTokens,
          underlyingTokens,
        },
      ]);
    }, []);

  const lockers = resp[4].parsed
    .map((locker) => {
      const rewardTokens = locker?.rewards
        ?.filter((t) => t.apr > 0)
        .map((t) => t.token.address);

      if (!CHAINS[locker.chainId]) return [];

      return {
        pool: locker.sdToken.symbol,
        chain: utils.formatChain(CHAINS[locker.chainId]),
        project: 'stake-dao',
        symbol: utils.formatSymbol(locker.sdToken.symbol),
        poolMeta: locker.protocol ? utils.formatChain(locker.protocol) : null,
        tvlUsd: locker.tvl,
        // Select lower bounds of rewards, without veSDT boost
        apyReward: locker.streaming ? locker.apr[0] : 0,
        apyBase: 0,
        rewardTokens,
        underlyingTokens: [locker.token.address],
      };
    })
    .flat();

  return utils.removeDuplicates(
    strats.concat(lockers).filter((i) => utils.keepFinite(i))
  );
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://stakedao.org',
};
