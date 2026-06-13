const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const BONKSOL_MINT = 'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs';
const priceKey = `solana:${BONKSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(BONKSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(BONKSOL_MINT),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch bonkSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${BONKSOL_MINT}`);

  return [
    {
      pool: BONKSOL_MINT,
      chain: 'Solana',
      project: 'bonk-staked-sol',
      symbol: 'bonkSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: BONKSOL_MINT,
      poolMeta: '5% rewards fee',
      url: 'https://app.sanctum.so/stake/bonkSOL',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bonkcoin.com/',
};
