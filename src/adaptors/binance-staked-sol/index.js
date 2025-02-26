const axios = require('axios');
const { getTotalSupply } = require('../utils');

const BNSOL_ADDRESS = 'BNso1VUJnh4zcfpZa6986Ea66P6TCp59hvtNJ8b1X85';
const priceKey = `solana:${BNSOL_ADDRESS}`;

const apy = async () => {
  const totalSupply = await getTotalSupply(BNSOL_ADDRESS);

  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const currentPrice = priceResponse.data.coins[priceKey].price;

  const binanceResponse = await axios.get(
    'https://www.binance.com/bapi/earn/v1/friendly/earn/restaking/project/detail'
  );
  const apy = binanceResponse.data.data.apy;

  return [
    {
      pool: BNSOL_ADDRESS,
      chain: 'Solana',
      project: 'binance-staked-sol',
      symbol: 'BNSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [BNSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://www.binance.com/en/solana-staking' };
