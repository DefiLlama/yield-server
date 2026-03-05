const utils = require('../utils');

const API_URL = 'https://prod-api.ekubo.org';
const STARKNET_CHAIN_ID = '0x534e5f4d41494e';

async function apy() {
  const [tokens, pairData] = await Promise.all([
    utils.getData(`${API_URL}/tokens`),
    utils.getData(`${API_URL}/overview/pairs`),
  ]);

  // Filter to Starknet tokens only and build lookup by address
  const starknetTokens = tokens.filter(
    (t) => t.chain_id === STARKNET_CHAIN_ID
  );
  const tokenByAddr = {};
  for (const t of starknetTokens) {
    tokenByAddr[BigInt(t.address).toString()] = t;
  }

  return pairData.topPairs
    .filter((p) => p.chain_id === STARKNET_CHAIN_ID)
    .map((p) => {
      const t0Key = BigInt(p.token0).toString();
      const t1Key = BigInt(p.token1).toString();
      const token0 = tokenByAddr[t0Key];
      const token1 = tokenByAddr[t1Key];
      if (!token0 || !token1) return;

      const price0 = token0.usd_price || 0;
      const price1 = token1.usd_price || 0;

      const tvlUsd =
        (price0 * Number(p.tvl0_total)) / Math.pow(10, token0.decimals) +
        (price1 * Number(p.tvl1_total)) / Math.pow(10, token1.decimals);

      if (tvlUsd < 10000) return;

      const feesUsd =
        (price0 * Number(p.fees0_24h)) / Math.pow(10, token0.decimals) +
        (price1 * Number(p.fees1_24h)) / Math.pow(10, token1.decimals);

      const apyBase = (feesUsd * 100 * 365) / tvlUsd;

      return {
        pool: `ekubo-${token0.symbol}-${token1.symbol}`,
        chain: 'Starknet',
        project: 'ekubo',
        symbol: `${token0.symbol}-${token1.symbol}`,
        underlyingTokens: [utils.padStarknetAddress(token0.address), utils.padStarknetAddress(token1.address)],
        tvlUsd,
        apyBase,
        url: `https://app.ekubo.org/charts/${token0.symbol}/${token1.symbol}`,
      };
    })
    .filter((p) => !!p)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ekubo.org/charts',
};
