const utils = require('../utils');

const LOCKERS_ENDPOINT = 'https://lockers.stakedao.org/api/lockers/cache';
const STRATEGIES_ENDPOINT = 'https://lockers.stakedao.org/api/strategies/cache';
const SDT_ADDRESS = '0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f';

const symbolMapping = {
  cvxETH: 'CVX-ETH',
  '3pool': 'DAI-USDC-USDT',
  Tricrypto2: 'DAI-ETH-WBTC',
  d3Pool: 'FRAX-FEI-ALUSD',
  FRAX3CRV: 'FRAX-3CRV',
  RAI3CRV: 'RAI-3CRV',
  cvxCRV: 'CVX-CRV',
  cvxETH: 'CVX-ETH',
  cvxFXS: 'CVX-FXS',
  CRVETH: 'CRV-ETH',
  ALUSDFRAXBP: 'ALUSD-FRAX',
  DOLA3POOL: 'DOLA-3CRV',
  mim: 'MIM-3CRV',
  IronBank: 'iDai-iUSDC-iUSDT',
  ren: 'renBTC-wBTC',
  Compound: 'cDAI-cUSDC',
  EUROC3CRV: 'EUROC-3CRV',
};

const poolsFunction = async () => {
  const resp = await Promise.all([
    utils.getData(`${STRATEGIES_ENDPOINT}/angle`),
    utils.getData(`${STRATEGIES_ENDPOINT}/curve`),
    utils.getData(`${STRATEGIES_ENDPOINT}/balancer`),
    utils.getData(`${STRATEGIES_ENDPOINT}/fraxv2`),
    utils.getData(`${LOCKERS_ENDPOINT}`)
  ]);
  const angleStrategies = resp[0];
  const curveStrategies = resp[1];
  const balancerStrategies = resp[2];
  const fraxv2Strategies = resp[3];
  const lockers = resp[4];

  const allStrats = angleStrategies
    .concat(curveStrategies)
    .concat(balancerStrategies)
    .concat(fraxv2Strategies)
    .concat(lockers);

  const strats = allStrats.reduce((acc, strat) => {
    const rewardTokens = strat?.aprBreakdown
      ?.filter((t) => {
        if (t.token.address === SDT_ADDRESS) {
          return parseFloat(t.maxAprFuture) > 0;
        }

        return t.apr > 0;
      })
      .map((t) => t.token.address);

    let apyBase;
    let apyReward;
    if (
      ['angle-agEUR-ETH', 'angle-agEUR-USDC', 'factory-v2-101'].includes(
        strat.key
      )
    ) {
      const aprBreakdown = strat?.aprBreakdown[1];
      apyBase = (aprBreakdown.fees + aprBreakdown.interests) * 100;

      // angle
      const apyAngle = aprBreakdown.currentAPR * 100;

      // sdt
      const apySDT = strat?.aprBreakdown[0].minApr * 100;

      apyReward = apyAngle + apySDT;
    } else {
      apyReward =
        strat?.aprBreakdown?.reduce((acc, t) => {
          if (t.token.address === SDT_ADDRESS) {
            return acc + parseFloat(t.maxAprFuture);
          }

          return acc + parseFloat(t.apr);
        }, 0.0) * 100;

      apyBase = strat.maxAprFuture * 100 - apyReward;
    }

    let symbol = strat.name.replace('/', '-').split(' ');
    symbol = symbol.length > 2 ? symbol[1] : symbol[0];
    symbol = Object.keys(symbolMapping).includes(symbol)
      ? symbolMapping[symbol]
      : symbol.includes('san')
      ? symbol.replace('san', '').split('-')[0]
      : symbol.replace('FRAXBP', '-crvFRAX');

    let underlyingTokens =
      strat?.underlyingTokens?.map((t) =>
        t?.symbol === 'ETH'
          ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
          : t?.address
      ) ?? [strat?.underlyingToken?.address] ??
      [];

    // check if this is a liquid locker
    if (!underlyingTokens[0] || strat.key === 'bal') {
      underlyingTokens = [strat?.tokenReceipt?.address];
    }
    return acc.concat([
      {
        pool: strat.key,
        chain: utils.formatChain('ethereum'),
        project: 'stakedao',
        symbol: utils.formatSymbol(symbol),
        poolMeta: utils.formatChain(strat.protocol),
        tvlUsd: strat.tvlUSD,
        apyReward,
        apyBase,
        rewardTokens,
        underlyingTokens,
      },
    ]);
  }, []);

  return strats;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lockers.stakedao.org',
};
