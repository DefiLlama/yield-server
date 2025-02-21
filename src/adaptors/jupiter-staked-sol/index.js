const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const JUPSOL_ADDRESS = 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v'

const getApy = async () => {
  const [apy, tvlData] = await Promise.all([
    utils.getData("https://worker.jup.ag/lst-apys"),
    utils.getData("https://api.coingecko.com/api/v3/coins/jupiter-staked-sol")
  ]);
  const apyValue = apy['apys'][JUPSOL_ADDRESS];

  const totalSupply = tvlData.market_data.total_supply
  const currentPrice = tvlData.market_data.current_price.usd
  const tvlValue = totalSupply * currentPrice;

  return [
    {
      pool: JUPSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'jupiter-staked-sol',
      symbol: utils.formatSymbol('jupsol'),
      tvlUsd: tvlValue,
      apyBase: apyValue * 100,
      underlyingTokens: [JUPSOL_ADDRESS],
    },
  ];
};

module.exports = { apy: getApy, url: 'https://station.jup.ag/guides/jupsol/jupsol' };
