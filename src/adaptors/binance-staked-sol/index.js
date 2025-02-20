const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const BNSOL_ADDRESS = 'BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85'
const priceKey = 'coingecko:solana';

const getApy = async () => {
  const bnsolData = await utils.getData("https://api.coingecko.com/api/v3/coins/binance-staked-sol")

  const totalSupply = bnsolData.market_data.total_supply
  const currentPrice = bnsolData.market_data.current_price.usd

  const apy =
    (
     await utils.getData("https://www.binance.com/bapi/earn/v1/friendly/earn/restaking/project/detail")
    ).data.apy;

  return [
    {
      pool: BNSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'binance-staked-sol',
      symbol: utils.formatSymbol('bnsol'),
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [BNSOL_ADDRESS],
    },
  ];
};

module.exports = { apy: getApy, url: 'https://www.binance.com/en/solana-staking' };
