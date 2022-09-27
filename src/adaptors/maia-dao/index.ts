const utils = require('../utils');

const API_URL: string = 'http://api.maiadao.io/maia-apr';
const MAIA: string = "0x72c232D56542Ba082592DEE7C77b1C6CFA758BCD";
const sMAIA: string = "0xD7a586CE5250bEfaB2cc2239F7226B9602536E6A";

const getApy = async () => {
  const res = await utils.getData(API_URL);

  const pool = [{
    pool: sMAIA,
    chain: utils.formatChain('metis'),
    project: 'maia-dao',
    symbol: 'MAIA',
    tvlUsd: res.tvl,
    apyReward: res.currentAPR,
    underlyingTokens: [MAIA],
    rewardTokens: [res.rewards['0'].token.address, res.rewards['1'].token.address, res.rewards['2'].token.address],
  }];

  return pool;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.maiadao.io/#/stake',
};
