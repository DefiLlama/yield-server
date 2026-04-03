const axios = require('axios');
const utils = require('../utils');

const ONYC_MINT = '5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const API_BASE = 'https://core.api.onre.finance/data';

const apy = async () => {
  const [apyRes, tvlRes] = await Promise.all([
    axios.get(`${API_BASE}/live-apy`),
    axios.get(`${API_BASE}/live-tvl`),
  ]);

  const parsedApy = parseFloat(apyRes.data);
  const parsedTvl = parseFloat(tvlRes.data);
  const apyBase = Number.isFinite(parsedApy) ? parsedApy * 100 : undefined;
  const tvlUsd = Number.isFinite(parsedTvl) ? parsedTvl : undefined;

  return [
    {
      pool: `${ONYC_MINT}-solana`,
      chain: utils.formatChain('solana'),
      project: 'onre',
      symbol: 'ONyc',
      tvlUsd,
      apyBase,
      underlyingTokens: [USDC_MINT],
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.onre.finance',
};
