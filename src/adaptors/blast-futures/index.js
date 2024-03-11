const utils = require('../utils');
const axios = require('axios');

const CHAIN = 'blast';
const TOKEN = 'USDB';
const API_URL = 'https://api.bfx.trade/vaults';

const getApy = async () => {
  let pools = [];

  const response = await axios.get(API_URL, {
    headers: { 'eid': 'bfx' },
  });
  pools = response.data.result;

  return pools.map((p) => ({
    chain: utils.formatChain(CHAIN),
    project: 'blast-futures',
    pool: 'Dynamic AMM LP',
    symbol: TOKEN,
    tvlUsd: Number(p.account_equity),
    apyBase: Number(p.apy),
    apyReward: Number('0.15'),
    rewardTokens: [TOKEN],
    poolMeta: `Dynamic Market Maker`,
    url: `https://bfx.trade/vaults/platformOverview?vault_wallet=0x2688c2bb0eeea0cd10de520699090a36469d788a`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.turbos.finance/#/pools',
};
