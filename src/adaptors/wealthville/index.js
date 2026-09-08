const utils = require('../utils');

// WealthVille is a non-custodial yield optimizer on Solana (DefiLlama protocol id 8032).
// The public feed returns one entry per active vault with its live on-chain NAV (`tvl_usd`) —
// the full value across idle balances, native SOL, CLMM/DLMM LP positions, JitoSOL staking and
// perp collateral — plus the vault's current apy and its holdings breakdown. We map each active
// vault to a pool.
const FEED = 'https://wealthville.net/api/v1/defillama/tvl';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Vaults can hold a long tail of small balances; keep the ticker readable.
const MAX_SYMBOL_PARTS = 3;

// Distinct mints the vault actually holds value in, largest position first — this both orders
// the ticker by dominance and gives us `underlyingTokens`.
const heldMints = (vault) => {
  const byMint = new Map();
  for (const t of vault.token_accounts || []) {
    const value = Number(t.value_usd) || 0;
    if (!t.mint || value <= 0) continue;
    byMint.set(t.mint, (byMint.get(t.mint) || 0) + value);
  }
  return [...byMint.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mint]) => mint);
};

// Resolve Solana mints to ticker symbols off DefiLlama's own price feed. Note we deliberately
// don't use `utils.getPrices` here: it lowercases the keys, and Solana mints are case-sensitive
// base58, so the lookup would miss.
const getSymbols = async (mints) => {
  if (!mints.length) return {};
  const keys = mints.map((m) => `solana:${m}`).join(',');
  const res = await utils.getData(
    `https://coins.llama.fi/prices/current/${keys}`
  );
  return Object.entries((res && res.coins) || {}).reduce((acc, [key, coin]) => {
    if (coin && coin.symbol) acc[key.split(':')[1]] = coin.symbol.toUpperCase();
    return acc;
  }, {});
};

const poolsFunction = async () => {
  const vaults = await utils.getData(FEED);
  const list = Array.isArray(vaults) ? vaults : (vaults && vaults.data) || [];

  const active = list.filter(
    // `vault_pubkey` guards the pool id — a vault missing it is skipped rather than
    // emitting a malformed `undefined-solana` pool.
    (v) => v && v.status === 'active' && v.vault_pubkey && Number(v.tvl_usd) > 0
  );

  // One price call covering every mint across every emitted vault.
  const symbols = await getSymbols([
    ...new Set(active.flatMap((v) => heldMints(v))),
  ]);

  return active.map((v) => {
    const mints = heldMints(v);
    const ticker = mints
      .map((m) => symbols[m])
      .filter(Boolean)
      .slice(0, MAX_SYMBOL_PARTS)
      .join('-');

    const pool = {
      pool: `${v.vault_pubkey}-solana`,
      chain: 'Solana',
      project: 'wealthville',
      // Ticker of the assets held; the vault's own name goes in `poolMeta`.
      symbol: ticker || 'SOL-USDC',
      tvlUsd: Number(v.tvl_usd) || 0,
      apyBase: Number(v.apy) || 0,
      underlyingTokens: mints.length ? mints : [SOL, USDC],
      url: v.slug
        ? `https://wealthville.net/vault/${v.slug}`
        : 'https://wealthville.net/opportunities',
    };
    if (v.name) pool.poolMeta = v.name;
    return pool;
  });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://wealthville.net',
  protocolId: '8032',
};
