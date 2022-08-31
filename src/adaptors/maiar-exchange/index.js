const { request } = require('graphql-request');
const { query } = require('./query');

const API_URL = 'https://graph.maiar.exchange/graphql';

const VARIABLES = { days: 7, mexID: 'MEX-455c57', offset: 0, pairsLimit: 500 };

const apy = async () => {
  const { farms, pairs } = await request(API_URL, query, VARIABLES);

  const pools = pairs.map((pair) => {
    const farm = farms.find(
      ({ farmingToken, apr }) =>
        farmingToken.identifier === pair.liquidityPoolToken.identifier && apr
    );

    const apyReward = Number(farm && farm.apr) * 100 || 0;

    return {
      pool: pair.address,
      project: 'maiar-exchange',
      chain: 'Elrond',
      symbol: `${pair.firstToken.ticker}-${pair.secondToken.ticker}`,
      tvlUsd: Number(pair.lockedValueUSD),
      apyBase: Number(pair.feesAPR) * 100 || 0,
      apyReward: apyReward,
      rewardTokens: apyReward ? ['MEX-455c57'] : [],
      underlyingTokens: [
        pair.firstToken.identifier,
        pair.secondToken.identifier,
      ],
    };
  });

  return pools;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://maiar.exchange/farms',
};
