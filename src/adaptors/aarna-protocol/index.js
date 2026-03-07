const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'ethereum';
const VAULT = '0xb9c1344105faa4681bc7ffd68c5c526da61f2ae8';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const ASRT = '0x3d2A8C1CFB03b6aC5C7171076253Bd05622c22e9';
const BASE_URL = 'https://engine.aarna.ai/api/v2/afi';

const apy = async () => {
  const [apyRes, tvlRes] = await Promise.all([
    axios.get(`${BASE_URL}/apy?vault_address=${VAULT}`),
    axios.get(`${BASE_URL}/total-tvl?vault_address=${VAULT}`),
  ]);

  const apyData = apyRes.data.data;
  const tvlData = tvlRes.data.data;

  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'aarna-protocol',
      symbol: 'atvPTMax',
      tvlUsd: parseFloat(tvlData.tvl),
      apyBase: apyData.baseAPY,
      apyReward: apyData.boostedAPY,
      rewardTokens: [ASRT],
      underlyingTokens: [USDC],
      poolMeta: 'atvPTMax',
      url: 'https://app.aarna.ai',
    },
  ];
};

module.exports = { timetravel: false, apy };
