undefinedconst utils = require('../utils');

const API = 'https://wealthville.net/api/v1/vaults';

// USDC on Solana — used as the reference underlying for vault NAV (USD-denominated).
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const poolsFunction = async () => {
  const { data } = await utils.getData(API);
  const vaults = Array.isArray(data) ? data : (data && data.data) || [];

  return vaults
    .filter((v) => v && v.status === 'active' && Number(v.tvl_usd) > 0)
    .map((v) => {
      const apy = Number(v.apy) || 0;
      return {
        pool: `${v.vault_pubkey}-solana`,
        chain: 'Solana',
        project: 'wealthville',
        symbol: v.name,
        tvlUsd: Number(v.tvl_usd) || 0,
        apyBase: apy,
        underlyingTokens: [USDC_SOL],
        poolMeta: v.strategy_type ? String(v.strategy_type).toUpperCase() : null,
        url: 'https://wealthville.net/opportunities',
      };
    });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://wealthville.net',
};
