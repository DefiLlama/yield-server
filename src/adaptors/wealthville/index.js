const utils = require('../utils');

const TVL_ENDPOINT = 'https://wealthville.net/tvl';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// WealthVille is a non-custodial yield optimizer on Solana. The /tvl endpoint returns one
// entry per vault with its live on-chain NAV (tvl_usd), current apy, and the full holdings
// breakdown (token_accounts, native SOL, clmm_positions). We map each active vault to a pool.
const poolsFunction = async () => {
  const vaults = await utils.getData(TVL_ENDPOINT);
  const list = Array.isArray(vaults) ? vaults : (vaults && vaults.data) || [];

  return list
    .filter((v) => v && v.status === 'active' && Number(v.tvl_usd) > 0)
    .map((v) => {
      const mints = [
        ...new Set(
          (v.token_accounts || [])
            .filter((t) => Number(t.value_usd) > 0 && t.mint)
            .map((t) => t.mint)
        ),
      ];
      return {
        pool: `${v.vault_pubkey}-solana`,
        chain: 'Solana',
        project: 'wealthville',
        symbol: v.name,
        tvlUsd: Number(v.tvl_usd) || 0,
        apyBase: Number(v.apy) || 0,
        underlyingTokens: mints.length ? mints : [USDC_SOL],
        url: 'https://wealthville.net/opportunities',
      };
    });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://wealthville.net',
};
