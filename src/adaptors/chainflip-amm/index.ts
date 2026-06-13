const utils = require('../utils');
const axios = require('axios');

type Asset = 'Btc' | 'Eth' | 'Sol' | 'Usdc' | 'Usdt';

type Pool = {
  pool: `boost-pool-btc` | `${Lowercase<Asset>}-chainflip-lending`;
  asset: Asset;
  chain: 'bitcoin' | 'ethereum' | 'solana';
  tvl: number;
  apy: number;
  coingeckoId: string;
};

const getPool = async () => {
  const apyData: { data: Pool[] } = await axios.get(
    'https://explorer-service-processor.chainflip.io/defi-llama/yield'
  );

  const boostPool = apyData.data.find((d) => d.pool === 'boost-pool-btc');
  if (!boostPool) return [];

  const btcPool = {
    pool: 'chainflip-boost-btc',
    chain: utils.formatChain('bitcoin'),
    project: 'chainflip-amm',
    symbol: 'BTC',
    tvlUsd: boostPool.tvl,
    apyBase: boostPool.apy,
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
