const { formatChain, getERC4626Info } = require('../utils');

const PROJECT = 'apyee';

// Apyee — non-custodial multi-chain USDC yield aggregator.
// Immutable ERC-4626 Vaults (VaultV2) deposit USDC into whitelisted DeFi
// lending strategies (Aave V3, Compound V3, Morpho MetaMorpho, Fluid, Venus, Spark).
// Prod deployment: v2.1.3 (2026-07-13). Audited by Soken (final PASS 91/100).
// https://apyee.com/security
//
// APY methodology: net APY derived from ERC-4626 share-price growth over the
// prior 24h window (via convertToAssets ratio, annualised daily).
// This is inherently NET of the 15% streaming performance fee: fees accrue by
// minting new shares to Treasury on each _accrue() hook, which dilutes existing
// share price. So on-chain price-per-share growth reflects what a user actually
// receives after fees — no separate subtraction required.
const VAULTS = [
  {
    address: '0xE46aac58214B963125a3A88541e1DBE56c4eD5f7',
    chain: 'ethereum',
    tier: 'Balanced',
    underlyingToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    underlyingDecimals: 6,
  },
  {
    address: '0xeA8FB89F44A1fa47E52354D44E7e6D4682C8529a',
    chain: 'base',
    tier: 'Balanced',
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingDecimals: 6,
  },
  {
    address: '0x87922c630A980e431fb045A178e53F58d3f07F85',
    chain: 'base',
    tier: 'Aggressive',
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingDecimals: 6,
  },
  {
    address: '0x94f89d1E2825d40627CD2aE24Eba8590F675049C',
    chain: 'arbitrum',
    tier: 'Balanced',
    underlyingToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    underlyingDecimals: 6,
  },
  {
    // BSC: Binance-Peg USDC has 18 decimals (not 6).
    address: '0x27DB5a2B203D6bd3C9490E8EA4488B968675f5Bf',
    chain: 'bsc',
    tier: 'Balanced',
    underlyingToken: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    underlyingDecimals: 18,
  },
];

const apy = async (timestamp) => {
  const results = await Promise.allSettled(
    VAULTS.map((v) => getERC4626Info(v.address, v.chain, timestamp))
  );
  const pools = [];
  for (let i = 0; i < VAULTS.length; i++) {
    const v = VAULTS[i];
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const { tvl, apyBase, pricePerShare } = r.value;
    // USDC is a $1-pegged stablecoin — normalise by asset decimals and use
    // direct token amount as USD proxy (avoids stale price feed edge cases).
    const tvlUsd = Number(tvl) / 10 ** v.underlyingDecimals;
    pools.push({
      pool: `${v.address}-${v.chain}`.toLowerCase(),
      chain: formatChain(v.chain),
      project: PROJECT,
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [v.underlyingToken],
      poolMeta: v.tier,
      url: 'https://apyee.com/vault/deposit',
      token: v.address,
    });
  }
  return pools;
};

module.exports = {
  protocolId: '8243',
  timetravel: false,
  apy,
  url: 'https://apyee.com/vault/deposit',
};
