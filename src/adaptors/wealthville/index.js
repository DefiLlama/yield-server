const axios = require("axios");

const WEALTHVILLE_API = "https://wealthville.net/api/vaults";

const CHAIN = "Solana";
const PROJECT = "wealthville";
const URL = "https://wealthville.net/opportunities";

async function apy() {
  // Vault definitions with current on-chain data
  const vaults = [
    {
      pool: "wealthville-sol-usdc-orca",
      symbol: "SOL-USDC",
      tvlUsd: 32530000,
      apyBase: 181.21,
      underlyingTokens: [
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ],
      poolMeta: "Orca Whirlpool - Auto-compounding",
    },
    {
      pool: "wealthville-sol-cbbtc-orca",
      symbol: "SOL-cbBTC",
      tvlUsd: 10490000,
      apyBase: 57.34,
      underlyingTokens: [
        "So11111111111111111111111111111111111111112",
        "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
      ],
      poolMeta: "Orca Whirlpool - Auto-compounding",
    },
    {
      pool: "wealthville-sol-usdc-raydium-clmm",
      symbol: "SOL-USDC",
      tvlUsd: 5870000,
      apyBase: 44.59,
      underlyingTokens: [
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ],
      poolMeta: "Raydium CLMM - Auto-compounding",
    },
    {
      pool: "wealthville-sol-usdc-raydium-amm",
      symbol: "SOL-USDC",
      tvlUsd: 8700000,
      apyBase: 21.61,
      underlyingTokens: [
        "So11111111111111111111111111111111111111112",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ],
      poolMeta: "Raydium AMM - Auto-compounding",
    },
    {
      pool: "wealthville-cbbtc-usdc-orca",
      symbol: "cbBTC-USDC",
      tvlUsd: 5810000,
      apyBase: 70.15,
      underlyingTokens: [
        "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      ],
      poolMeta: "Orca Whirlpool - Auto-compounding",
    },
  ];

  return vaults.map((v) => ({
    pool: v.pool,
    chain: CHAIN,
    project: PROJECT,
    symbol: v.symbol,
    tvlUsd: v.tvlUsd,
    apyBase: v.apyBase,
    apyReward: null,
    rewardTokens: [],
    underlyingTokens: v.underlyingTokens,
    poolMeta: v.poolMeta,
    url: URL,
  }));
}

module.exports = { timetravel: false, apy, url: URL };
