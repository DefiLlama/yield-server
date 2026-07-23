const utils = require('../utils');

// WealthVille is a non-custodial yield optimizer on Solana (DefiLlama protocol id 8032).
// The public feed returns one entry per active vault with its live on-chain NAV (`tvl_usd`) —
// the full value across idle balances, native SOL, CLMM/DLMM LP positions, JitoSOL staking and
// perp collateral — plus the vault's current apy and its holdings breakdown. We map each active
// vault to a pool.
const FEED = 'https://wealthville.net/api/v1/defillama/tvl';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const poolsFunction = async () => {
  const vaults = await utils.getData(FEED);
  const list = Array.isArray(vaults) ? vaults : (vaults && vaults.data) || [];

  return list
    .filter((v) => v && v.status === 'active' && Number(v.tvl_usd) > 0)
    .map((v) => {
      // Underlying tokens = the distinct mints the vault actually holds value in.
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
        symbol: v.name || v.slug,
        tvlUsd: Number(v.tvl_usd) || 0,
        apyBase: Number(v.apy) || 0,
        underlyingTokens: mints.length ? mints : [SOL, USDC],
        url: v.slug
          ? `https://wealthville.net/vault/${v.slug}`
          : 'https://wealthville.net/opportunities',
      };
    });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://wealthville.net',
  protocolId: '8032',
};
