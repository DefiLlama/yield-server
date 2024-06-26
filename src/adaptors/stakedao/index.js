const utils = require('../utils');

const API_ENDPOINT = 'https://api.stakedao.org/api/strategies';
const SDT_ADDRESS = '0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f';

const CHAINS = {
  1 : 'ethereum',
  42161 : 'arbitrum'
}

const poolsFunction = async () => {
  const resp = await Promise.all([
    utils.getData(`${API_ENDPOINT}/curve`),
  ]);
  const curveStrategies = resp[0].deployed;

  const strats = curveStrategies.reduce((acc, strat) => {
    const rewardTokens = strat?.rewards
      ?.filter((t) => {
        if (t.token.address === SDT_ADDRESS) {
          return parseFloat(strat.sdtApr.sdtFuturMinApr) > 0;
        }

        return t.apr > 0;
      })
      .map((t) => t.token.address);

    // strategies APR
    
    const apyBase = strat.tradingApy;
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
        project: 'stakedao',
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

  return strats.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://stakedao.org',
};
