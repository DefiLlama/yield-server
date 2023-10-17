const utils = require('../utils');
const sdk = require('@defillama/sdk3');

async function getSingleYieldVaultAPY() {
  const api = await utils.getData(
    'https://factor-api-mainnet.fly.dev/vaults-status'
  );

  // { pool, chain, project, symbol, tvlUsd, apyBase }[]
  const poolData = await Promise.all(
    api.vaults.map(async (item) => {
      const project = 'factor-v2';
      const chain = 'arbitrum';
      const pool = `${item.lastSnapshot.vaultAddress}-${chain}`.toLowerCase();
      const url = `https://app.factor.fi/vault/${item.lastSnapshot.vaultAddress}`;
      const symbol = item.vaultSymbol;
      const tvlUsd = item.lastSnapshot.tvl;
      const apyBase = item.lastSnapshot.apy;

      const { output: underlyingToken } = await sdk.api.abi.call({
        chain: 'arbitrum',
        target: item.lastSnapshot.vaultAddress,
        abi: 'address:asset',
      });

      return {
        pool,
        chain,
        project,
        symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [underlyingToken],
        url,
      };
    })
  );

  return poolData;
}

module.exports = {
  timetravel: false,
  apy: getSingleYieldVaultAPY,
};
