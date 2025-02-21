const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const MSOL_ADDRESS = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'

const getApy = async () => {
  const [apy, tvlData] = await Promise.all([
    utils.getData("https://api.marinade.finance/msol/apy/7d"),
    utils.getData("https://api.marinade.finance/tlv")
  ]);
  const apyValue = apy['value'];
  const tvlValue = tvlData['staked_usd'];

  return [
    {
      pool: MSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'marinade-liquid-staking',
      symbol: utils.formatSymbol('msol'),
      tvlUsd: tvlValue,
      apyBase: apyValue * 100,
      underlyingTokens: [MSOL_ADDRESS],
    },
  ];
};

module.exports = { apy: getApy, url: 'https://marinade.finance/liquid-staking' };