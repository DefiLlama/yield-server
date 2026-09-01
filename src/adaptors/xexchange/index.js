const { request } = require('graphql-request');
const { query } = require('./query.json');
const utils = require('../utils');

const API_URL = 'https://graph.xexchange.com/graphql';

const apy = async () => {
  let { farms } = await request(API_URL, query);
  farms = farms.filter((p) => p.address && p.rewardType !== 'deprecated');

  const pools = farms.map((farm) => {
    const apyReward = Number(farm.baseApr) * 100 || 0;
    return {
      pool: farm.pair.address,
      project: 'xexchange',
      chain: 'MultiversX',
      symbol: `${farm.pair.firstToken.ticker}-${farm.pair.secondToken.ticker}`,
      tvlUsd: Number(farm.totalValueLockedUSD),
      apyBase: Number(farm.pair.feesAPR) * 100 || 0,
      apyReward,
      rewardTokens: apyReward ? ['MEX-455c57'] : [],
      underlyingTokens: [
        farm.pair.firstToken?.identifier,
        farm.pair.secondToken?.identifier,
      ],
      url: `https://xexchange.com/liquidity/${farm.pair.liquidityPoolToken.identifier}/create-position/farm`,
    };
  });

  return utils.removeDuplicates(pools);
};

module.exports = {
  protocolId: '854',
  apy,
  timetravel: false,
  url: 'https://xexchange.com/farms',
};
