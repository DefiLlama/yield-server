const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const INF_MINT = '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm';
const priceKey = `solana:${INF_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(INF_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(INF_MINT),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch INF price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${INF_MINT}`);

  return [
    {
      pool: INF_MINT,
      chain: 'Solana',
      project: 'sanctum-infinity',
      symbol: 'INF',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: INF_MINT,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sanctum.so/stake/INF',
};
