const utils = require('../utils');
const { getApecoinApy } = require('./apy');

const poolsFunction = async () => {
  const [apeApy, tvlData] = await Promise.all([
    getApecoinApy(),
    utils.getData('https://endpoints.jpegd.io/api/tvl'),
  ]);

  const APE = '0x4d224452801aced8b2f0aebe155379bb5d594381';
  const apePool = {
    pool: '0xD4b06218C545C047ac3ACc7cE49d124C172DB409',
    chain: utils.formatChain('ethereum'),
    project: 'jpegd',
    symbol: utils.formatSymbol('APE'),
    rewardTokens: [APE],
    underlyingTokens: [APE],
    tvlUsd: Number(tvlData.tokenBalancesUsd.ape),
    apy: apeApy,
  };

  return [apePool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://jpegd.io/ape-staking',
};
