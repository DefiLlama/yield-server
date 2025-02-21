const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const MSOL_ADDRESS = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'

const getApy = async () => {
  const msolData = await utils.getData("https://api.coingecko.com/api/v3/coins/marinade-staked-sol")

  const totalSupply = msolData.market_data.total_supply
  const currentPrice = msolData.market_data.current_price.usd
  const apy =
    (
     await utils.getData("https://api.marinade.finance/msol/apy/7d")
    )['value'];

  return [
    {
      pool: MSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'marinade-liquid-staking',
      symbol: utils.formatSymbol('msol'),
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [MSOL_ADDRESS],
    },
  ];
};

module.exports = { apy: getApy, url: 'https://marinade.finance/liquid-staking' };