const axios = require('axios');
const { getTotalSupply } = require('../utils');

const BBSOL_ADDRESS = 'Bybit2vBJGhPF52GBdNaQfUJ6ZpThSgHBobjWZpLPb4B';
const priceKey = `solana:${BBSOL_ADDRESS}`;

const apy = async () => {
  const totalSupply = await getTotalSupply(BBSOL_ADDRESS);

  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const currentPrice = priceResponse.data.coins[priceKey].price;

  const bybitResponseBBSOL = await axios.get(
    'https://api2.bybit.com/spot/api/web3/staking/v2/pool/apys?poolId=77&span=1'
  );
  const apy = bybitResponseBBSOL.data.result.apys.at(-1).apy;

  return [
    {
      pool: BBSOL_ADDRESS,
      chain: 'Solana',
      project: 'bybit-staked-sol',
      symbol: 'BBSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy,
      underlyingTokens: [BBSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://www.bybit.com/en/web3/staking/BybitSOL' };
