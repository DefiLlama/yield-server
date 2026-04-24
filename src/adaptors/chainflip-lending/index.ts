const utils = require('../utils');
const axios = require('axios');

type Asset = 'Btc' | 'Eth' | 'Sol' | 'Usdc' | 'Usdt';

type Pool = {
  pool: `boost-pool-Btc` | `lending-pool-${Asset}`;
  asset: Asset;
  chain: 'bitcoin' | 'ethereum' | 'solana';
  tvl: number;
  apy: number;
  coingeckoId: string;
};

const getPools = async () => {
  const apyData: { data: Pool[] } = await axios.get(
    'https://explorer-service-processor.chainflip.io/defi-llama/yield'
  );

  const lendingPools = apyData.data.filter((d) =>
    d.pool.includes('lending-pool')
  );

  const pools = lendingPools.map((pool) => {
    return {
      pool: pool.pool,
      chain: utils.formatChain(pool.chain),
      project: 'chainflip-lending',
      symbol: utils.formatSymbol(pool.asset.toUpperCase()),
      tvlUsd: pool.tvl,
      apy: pool.apy,
      url: `https://scan.chainflip.io/pools/${pool.asset}/lending`,
      underlyingTokens: [`coingecko:${pool.coingeckoId}`],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://scan.chainflip.io/lending/markets',
};
