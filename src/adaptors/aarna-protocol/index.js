const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const VAULT = '0xd7956afcff5ebb0a84a2470aed3d8147cc00e617';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BASE_URL = 'https://engine.aarna.ai/api/v2/afi';

const apy = async () => {
  const [apyRes, { output: rawTvl }] = await Promise.all([
    axios.get(`${BASE_URL}/apy?vault_address=${VAULT}`),
    sdk.api.abi.call({
      target: VAULT,
      abi: 'function getCurrentTVL() view returns (uint256)',
      chain: CHAIN,
    }),
  ]);

  const apyData = apyRes.data.data;
  const tvlUsd = Number(rawTvl) / 1e18;

  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'aarna-protocol',
      symbol: 'atvPTMax',
      tvlUsd,
      apyBase: apyData.baseAPY,
      underlyingTokens: [USDC],
      poolMeta: 'atvPTMax',
      url: 'https://engine.aarna.ai/',
    },
  ];
};

module.exports = { protocolId: '5773', timetravel: false, apy };
