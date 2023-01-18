const { request } = require('graphql-request');
const { query } = require('./query.json');

const API_URL = 'https://graph.xexchange.com/graphql';

const VARIABLES = { days: 7, mexID: 'MEX-455c57', offset: 0, pairsLimit: 500 };

const apy = async () => {
  let { farms } = await request(API_URL, query, VARIABLES);
  farms = farms.filter((p) => p.address);

  const pools = farms.map((farm) => {
    const apyReward = Number(farm.baseApr) * 100 || 0;
    return {
      pool: farm.pair.address,
      project: 'xexchange',
      chain: 'Elrond',
      symbol: `${farm.pair.firstToken.ticker}-${farm.pair.secondToken.ticker}`,
      tvlUsd: Number(farm.totalValueLockedUSD),
      apyBase: Number(farm.pair.feesAPR) * 100 || 0,
      apyReward,
      rewardTokens: apyReward ? ['MEX-455c57'] : [],
      underlyingTokens: [
        farm.pair.firstToken?.identifier,
        farm.pair.secondToken?.identifier,
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
