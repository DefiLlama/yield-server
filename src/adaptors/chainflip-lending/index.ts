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
  tokenContractAddress: string | null;
};

const getPools = async () => {
  const apyData: { data: Pool[] } = await axios.get(
    'https://explorer-service-processor.chainflip.io/defi-llama/yield'
  );

  const lendingPools = apyData.data.filter((d) =>
    d.pool.endsWith('-chainflip-lending')
  );

  return lendingPools.map((pool) => ({
    pool: pool.pool,
    chain: utils.formatChain(pool.chain),
    project: 'chainflip-lending',
    symbol: utils.formatSymbol(pool.asset.toUpperCase()),
    tvlUsd: pool.tvl,
    apyBase: pool.apy,
    url: `https://scan.chainflip.io/pools/${pool.asset}/lending`,
    underlyingTokens: [
      pool.tokenContractAddress ?? `coingecko:${pool.coingeckoId}`,
    ],
  }));
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://scan.chainflip.io/lending/markets',
};
