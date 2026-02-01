const utils = require('../utils');
const superagent = require('superagent');

const getPool = async () => {
  const apyData = await superagent.get(
    'https://explorer-service-processor.chainflip.io/defi-llama/yield'
  );
  const [pool] = apyData.body;

  const btcPool = {
    pool: 'chainflip-boost-btc',
    chain: utils.formatChain('bitcoin'),
    project: 'chainflip',
    symbol: utils.formatSymbol('BTC'),
    tvlUsd: pool.tvl,
    apy: pool.apy,
    url: 'https://scan.chainflip.io/pools/Btc/boost',
  };

  return [btcPool];
};

module.exports = {
  timetravel: false,
  apy: getPool,
  url: 'https://scan.chainflip.io/pools/Btc/boost',
};
