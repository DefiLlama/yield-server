const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'satsuma';
const CHAIN = 'citrea';

// Satsuma's analytics subgraph was deleted upstream, which silently dropped
// every Satsuma pool from this adapter. Both sources below are on-chain or
// derived from on-chain logs, so there is no indexer to go stale again.
const POOL_STATS = 'https://s33-epoch-cron.tiagopratas69.workers.dev/pool-stats';
const RPC = 'https://rpc.mainnet.citrea.xyz';

// Algebra pools carry a dynamic fee. globalState.lastFee is not usable here (it
// reads a constant across pools), so take the live value from fee().
const SELECTORS = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  fee: '0xddca3f43',
  symbol: '0x95d89b41',
};

/** One JSON-RPC batch instead of a request per call. */
const ethCallBatch = async (calls) => {
  const { data } = await axios.post(
    RPC,
    calls.map((c, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'eth_call',
      params: [{ to: c.to, data: c.data }, 'latest'],
    }))
  );
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r.result]));
  return calls.map((_, i) => byId.get(i) ?? null);
};

const toAddress = (word) =>
  word && word.length >= 66 ? `0x${word.slice(26, 66)}`.toLowerCase() : null;

const toNumber = (word) => (word && word !== '0x' ? Number(BigInt(word)) : null);

/** Minimal ABI-decode of a dynamic string return. */
const toSymbol = (word) => {
  if (!word || word === '0x') return null;
  const body = word.slice(2);
  try {
    const len = Number(BigInt(`0x${body.slice(64, 128)}`));
    if (!len || len > 64) return null;
    const hex = body.slice(128, 128 + len * 2);
    return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '') || null;
  } catch {
    return null;
  }
};

const apy = async () => {
  const { data: stats } = await axios.get(POOL_STATS);
  const pools = Object.entries(stats?.pools ?? {}).filter(
    ([, s]) => Number(s.tvlUSD) > 0
  );
  if (!pools.length) return [];

  const addresses = pools.map(([address]) => address);

  const [token0s, token1s, fees] = await Promise.all([
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token0 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token1 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.fee }))),
  ]);

  const tokens = addresses.flatMap((_, i) => [toAddress(token0s[i]), toAddress(token1s[i])]);
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  const symbolResults = await ethCallBatch(
    uniqueTokens.map((to) => ({ to, data: SELECTORS.symbol }))
  );
  const symbolByToken = Object.fromEntries(
    uniqueTokens.map((token, i) => [token, toSymbol(symbolResults[i])])
  );

  const result = pools
    .map(([address, stat], i) => {
      const token0 = toAddress(token0s[i]);
      const token1 = toAddress(token1s[i]);
      const symbol0 = symbolByToken[token0];
      const symbol1 = symbolByToken[token1];
      if (!token0 || !token1 || !symbol0 || !symbol1) return null;

      const tvlUsd = Number(stat.tvlUSD);
      const volumeUsd24h = Number(stat.volumeUSD24h) || 0;
      // fee() is in hundredths of a bip (1e6 == 100%).
      const feeRate = (toNumber(fees[i]) ?? 0) / 1e6;
      const fees24h = volumeUsd24h * feeRate;

      return {
        pool: `${address}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(`${symbol0}-${symbol1}`),
        tvlUsd,
        apyBase: tvlUsd > 0 ? (fees24h / tvlUsd) * 365 * 100 : 0,
        underlyingTokens: [token0, token1],
        volumeUsd1d: volumeUsd24h,
        url: `https://www.satsuma.exchange/pool/${address}`,
      };
    })
    .filter(Boolean)
    .filter((p) => Number.isFinite(p.tvlUsd) && p.tvlUsd > 0)
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(result, PROJECT, (pool) => pool.pool.split(`-${CHAIN}`)[0]);
};

module.exports = {
  protocolId: '7336',
  timetravel: false,
  apy,
  url: 'https://www.satsuma.exchange/pools',
};
