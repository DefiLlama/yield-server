const sdk = require('@defillama/sdk');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const strategyInfoEndpoint =
  'https://graph.stellaxyz.io/api/rest/defillama/strategy_info';

const apy = async () => {
  const result = [];

  const { strategy: strategies } = await utils.getData(strategyInfoEndpoint);

  for (const strategy of strategies) {
    const maxLeverage =
      strategy.strategy_info.yield_info['Default'].maxLeverage;

    let baseApy = 0;

    if (strategy.exchange.name === 'Trader Joe V2') {
      try {
        baseApy =
          strategy?.strategy_info?.additional_data?.priceRangeInfos['Uniform'][
            'Wide'
          ]?.apr ?? 0;
      } catch (err) {
        console.log(err);
      }
    } else {
      try {
        baseApy =
          strategy?.strategy_info?.additional_data?.priceRangeInfos?.find(
            (x) => x.priceRangeType === 'Wide'
          )?.apr ?? 0;
      } catch (err) {
        console.log(err);
      }
    }

    const feeBps = strategy?.additional_info.feeBps;
    let poolMeta;
    if (feeBps) {
      poolMeta = `${(
        (strategy?.additional_info.feeBps / 10000) *
        100
      ).toLocaleString()}% (${
        strategy.exchange.name
      }) Lev Up to ${maxLeverage.toFixed(0)}x`;
    } else {
      poolMeta = `(${strategy.exchange.name}) Lev Up to ${maxLeverage.toFixed(
        0
      )}x`;
    }

    result.push({
      pool: `${strategy.strategy_address}-arbitrum`,
      chain: utils.formatChain('arbitrum'),
      project: 'stella',
      symbol: strategy.name.split('/').join('-'),
      poolMeta: poolMeta,
      tvlUsd: strategy.strategy_info.strategy_tvl,
      apyBase: baseApy * 100,
      underlyingTokens: strategy.underlying_tokens,
      url: `https://app.stellaxyz.io/strategies/${strategy.strategy_address}`,
    });
  }

  return result;
};

module.exports = apy;
