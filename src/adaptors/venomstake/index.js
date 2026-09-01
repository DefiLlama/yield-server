const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const VENOM = 'coingecko:venom';

const fetch = async () => {
  const [{ data }, { coins }] = await Promise.all([
    utils.getData('https://api.venomstake.com/v1/strategies/main'),
    utils.getPriceApiData(`/prices/current/${VENOM}`),
  ]);
  const price = coins[VENOM]?.price;

  return [{
    pool: 'be424d43-ccb6-4a2e-8064-222150b69aa0',
    chain: utils.formatChain('venom'),
    project: 'venomstake',
    symbol: 'VENOM',
    tvlUsd: BigNumber(data.tvl).div(1e9).multipliedBy(price).toNumber(),
    rewardTokens: ['0:77d36848bb159fa485628bc38dc37eadb74befa514395e09910f601b841f749e'],
    underlyingTokens: [VENOM],
    apyBase: BigNumber(data.apy).multipliedBy(100).toNumber()
  }];
};

module.exports = {
  protocolId: '4537',
  timetravel: false,
  apy: fetch,
  url: 'https://venomstake.com/',
};
