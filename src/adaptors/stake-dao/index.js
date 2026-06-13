const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const API_ENDPOINT = 'https://api.stakedao.org/api/';
const SDT_ADDRESS = '0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f';

// Boosted reward tokens per protocol — the API reports these with apr: 0
// in the rewards array, but the actual APR is in apr.current.details
const BOOST_TOKEN_SYMBOL = {
  curve: 'CRV',
  balancer: 'BAL',
};

const CHAINS = {
  1: 'ethereum',
  42161: 'arbitrum',
  56: 'bsc',
  252: 'fraxtal',
  10: 'optimism',
  100: 'gnosis',
  8453: 'base',
  146: 'sonic',
  42793: 'etherlink',
};

const poolsFunction = async () => {
  const resp = await Promise.all([
    // Strategies v1
    utils.getData(`${API_ENDPOINT}strategies/pendle`),
    utils.getData(`${API_ENDPOINT}strategies/yearn`),
    // Strategies v2
    utils.getData(`${API_ENDPOINT}strategies/v2/curve`),
    utils.getData(`${API_ENDPOINT}strategies/v2/balancer`),
    // Lockers
    utils.getData(`${API_ENDPOINT}lockers`),
  ]);

  const pendleStrategies = resp[0].deployed;
  const yearnStrategies = resp[1].deployed;

  const v2CurveStrategies = resp[2];
  const v2BalancerStrategies = resp[3];

  const strats = v2CurveStrategies
    .concat(v2BalancerStrategies)
    .concat(pendleStrategies)
    .concat(yearnStrategies)
    .reduce((acc, strat) => {
      const rewardTokens = (
        strat?.rewards
          ?.filter((t) => {
            if (t.token.address === SDT_ADDRESS) {
              return parseFloat(strat.sdtApr.sdtFuturMinApr) > 0;
            }

            return t.apr > 0;
          })
          .map((t) => t.token.address) || []
      );

      // strategies APR
      let apyBase =
        strat.tradingApy +
        (strat.underlyingReward?.reduce(
          (acc, underlyingReward) => acc + underlyingReward.apy,
          0
        ) || 0);
      let apyReward = strat.apr.current.total - apyBase;

      let symbol = strat.name?.replace('/', '-') ?? ['placeholder'];
      let poolMeta = strat.protocol ? utils.formatChain(strat.protocol) : null;

      let underlyingTokens = strat?.coins?.map((t) =>
        t?.symbol === 'ETH'
          ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
          : t?.address
      );

      // Handle Curve LlamaLend pools
      if (strat.isLending) {
        const crvUsdCoin = strat.coins?.find((c) => c.symbol === 'crvUSD');
        const collateralCoin = strat.coins?.find(
          (c) => c.symbol !== 'crvUSD'
        );
        symbol = 'crvUSD';
        poolMeta = `Curve LlamaLend ${collateralCoin?.symbol || ''}`.trim();
        if (crvUsdCoin) {
          underlyingTokens = [crvUsdCoin.address];
        }
      }

      // Curve/Balancer boosted reward APR is included in apr.current.total
      // but reported as apr: 0 in the rewards array — add the token explicitly
      const boostSymbol = BOOST_TOKEN_SYMBOL[strat.protocol];
      if (apyReward > 0 && boostSymbol) {
        const boostReward = strat?.rewards?.find(
          (r) => r.token?.symbol === boostSymbol
        );
        if (
          boostReward &&
          !rewardTokens.includes(boostReward.token.address)
        ) {
          rewardTokens.push(boostReward.token.address);
        }
      }


      return acc.concat([
        {
          pool: `sd-${strat.key}-${CHAINS[strat.chainId]}`.toLowerCase(),
          chain: utils.formatChain(CHAINS[strat.chainId]),
          project: 'stake-dao',
          symbol: symbol ? symbol : null,
          poolMeta,
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
        pool: locker.sdToken.symbol.toLowerCase(),
        chain: utils.formatChain(CHAINS[locker.chainId]),
        project: 'stake-dao',
        symbol: locker.sdToken.symbol,
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

  const pools = utils.removeDuplicates(
    strats.concat(lockers).filter((i) => utils.keepFinite(i))
  );

  return addMerklRewardApy(pools, 'stakedao');
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://stakedao.org',
};
