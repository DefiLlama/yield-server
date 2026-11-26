const axios = require('axios');

const api = 'https://api.guanaco.fi/v1';
const day = 86400;
// Deployment order of the Guanaco covenant variants, in basis points.
const tierBps = [1, 5, 30, 100, 10, 20, 50];
const lpShare = 0.9;

async function get(url, params) {
  return (await axios.get(url, { params, timeout: 20000 })).data;
}

async function getMarkets() {
  const markets = new Map();
  const outputs = new Set();
  let snapshot;
  let total;

  do {
    const page = await get(api + '/pools', {
      protocol: 'guanaco', limit: 1000, offset: outputs.size, snapshot,
    });
    if (!page.snapshot || !Number.isSafeInteger(page.total) || page.total < 0 ||
        (snapshot && (page.snapshot !== snapshot || page.total !== total)) ||
        (!page.pools.length && outputs.size < page.total))
      throw new Error('Incomplete Guanaco pool snapshot');
    snapshot = page.snapshot;
    total = page.total;
    for (const pool of page.pools) {
      const { category, feeLevel, satoshis } = pool;
      const outpoint = pool.txid + ':' + pool.vout;
      if (outputs.has(outpoint) || pool.protocol !== 'guanaco' ||
          !/^[0-9a-f]{64}$/.test(category) || !Number.isInteger(feeLevel) ||
          tierBps[feeLevel] === undefined || !/^\d+$/.test(satoshis) ||
          !/^\d+$/.test(pool.tokenAmount))
        throw new Error('Invalid Guanaco pool ' + outpoint);
      outputs.add(outpoint);
      if (BigInt(pool.tokenAmount) === 0n || BigInt(satoshis) === 0n) continue;
      const id = category + '-' + feeLevel;
      const market = markets.get(id) || { category, feeLevel, sats: 0n };
      market.sats += BigInt(satoshis);
      markets.set(id, market);
    }
  } while (outputs.size < total);
  if (outputs.size !== total) throw new Error('Unexpected Guanaco pool count');
  return markets.values();
}

async function volumeInSats(category, feeLevel, end) {
  const start = end - day;
  const params = { protocol: 'guanaco', fee_level: feeLevel, start, end };
  const data = await get(api + '/candles/' + category, { ...params, step: day });
  if (data.start !== start || data.end !== end || data.step !== day ||
      data.protocol !== 'guanaco' || data.includesMempool !== false ||
      data.feeLevel !== (feeLevel ?? null) || !Array.isArray(data.candles))
    throw new Error('Invalid Guanaco candle window');
  if (!data.candles.length) {
    if (feeLevel !== undefined) return 0n; // Validated against the unfiltered category total below.
    const trades = await get(api + '/trades/' + category, { ...params, limit: 1 });
    if (trades.start === start && trades.end === end && trades.feeLevel === null &&
        trades.protocol === 'guanaco' && trades.includesMempool === false &&
        trades.truncated === false && Array.isArray(trades.trades) && !trades.trades.length)
      return 0n;
    throw new Error('Missing Guanaco volume for ' + category);
  }
  const [candle] = data.candles;
  if (data.candles.length !== 1 || candle.time !== start || !/^\d+$/.test(candle.volumeSatoshis))
    throw new Error('Invalid daily volume');
  return BigInt(candle.volumeSatoshis);
}

async function apy() {
  const [markets, history, prices, metadata] = await Promise.all([
    getMarkets(), get(api + '/market-history', { protocol: 'guanaco' }),
    get('https://coins.llama.fi/prices/current/coingecko:bitcoin-cash'),
    get('https://guanaco.fi/api/tokens'),
  ]);
  const end = Math.min(history.indexedThrough, history.end);
  const now = Date.now() / 1000;
  if (!Number.isSafeInteger(end) || end > now || now - end > 3 * 3600 ||
      history.protocol !== 'guanaco' || history.includesMempool !== false ||
      history.volumeDefinition !== 'gross_swap_legs')
    throw new Error('Invalid or stale Guanaco market history');
  const price = prices.coins['coingecko:bitcoin-cash'];
  if (!(price.price > 0) || !(Math.abs(now - price.timestamp) < 3 * 3600))
    throw new Error('Missing or stale BCH price');
  const symbols = new Map(metadata.map(token => [token.token_id, token.bcmr?.token?.symbol]));
  const histories = new Map(history.assets.map(asset => [asset.category, asset]));
  const volumes = new Map();
  const pools = [];
  for (const { category, feeLevel, sats } of markets) {
    if (!volumes.has(category)) {
      const total = await volumeInSats(category, undefined, end);
      const byTier = new Map();
      if (total > 0n) {
        let sum = 0n;
        for (const tier of histories.get(category).feeTiers) {
          const value = await volumeInSats(category, tier.feeLevel, end);
          byTier.set(tier.feeLevel, value);
          sum += value;
        }
        if (sum !== total) throw new Error('Incomplete tier volumes for ' + category);
      }
      volumes.set(category, byTier);
    }
    const volume = Number(volumes.get(category).get(feeLevel) || 0n) / 1e8;
    // Mark the paired CashToken at its own pool reserve ratio (two-sided LP NAV).
    const liquidityBch = 2 * Number(sats) / 1e8;
    const feesBch = volume * tierBps[feeLevel] / 10000 * lpShare;
    pools.push({
      pool: 'guanaco-' + category + '-' + feeLevel + '-bitcoincash',
      project: 'guanaco', chain: 'Bitcoincash',
      symbol: 'BCH-' + (symbols.get(category) || category),
      poolMeta: tierBps[feeLevel] / 100 + '% fee tier',
      token: null,
      tvlUsd: liquidityBch * price.price,
      volumeUsd1d: volume * price.price,
      apyBase: Math.expm1(365 * Math.log1p(feesBch / liquidityBch)) * 100,
    });
  }
  return pools;
}

module.exports = { protocolId: '9519', timetravel: false, url: 'https://guanaco.fi/liquidity', apy };
