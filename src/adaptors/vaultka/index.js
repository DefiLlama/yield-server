const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  const response = await axios.get('https://solana-api.vaultka.com/lend/all');
  const { usdc, sol } = response.data.data;
  const poolsConfig = [
    {
      pool: 'nKMLJtN1rr64K9DjmfzXvzaq4JEy5a4AJHHP9gY1dW6',
      symbol: 'USDC',
      underlyingTokens: ['Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'],
      data: usdc,
    },
    {
      pool: 'DMhoXyVNpCFeCEfEjEQfS6gzAEcPUUSXM8Xnd2UXJfiS',
      symbol: 'SOL',
      data: sol,
    },
  ];

  return poolsConfig.map(({ pool, symbol, underlyingTokens, data }) => ({
    pool,
    chain: 'Solana',
    project: 'vaultka',
    symbol,
    underlyingTokens,
    url: 'https://solana.vaultka.com/',
    apyBase: data.apr,
    tvlUsd: data.vaultBalanceInUsd,
    totalBorrowUsd: data.borrowedAmountInUsd,
  }));
};

module.exports = {
  apy: getApy,
  url: 'https://solana.vaultka.com/',
};
