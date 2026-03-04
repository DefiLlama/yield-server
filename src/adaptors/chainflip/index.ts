const utils = require('../utils');
const axios = require('axios');

const getPool = async () => {
  const apyData = await axios.get(
    'https://explorer-service-processor.chainflip.io/defi-llama/yield'
  );
  const [pool] = apyData.data;

  const btcPool = {
    pool: 'chainflip-boost-btc',
    chain: utils.formatChain('bitcoin'),
    project: 'chainflip',
    symbol: utils.formatSymbol('BTC'),
    tvlUsd: pool.tvl,
    apy: pool.apy,
    url: 'https://scan.chainflip.io/pools/Btc/boost',
    underlyingTokens: ['coingecko:bitcoin'],
  };

  return [btcPool];
};

module.exports = {
  timetravel: false,
  apy: getPool,
  url: 'https://scan.chainflip.io/pools/Btc/boost',
};
