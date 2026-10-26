const axios = require('axios');
const utils = require('../utils');

const VAULT =
  '0x333d1890e0aa3762bb256f5caeeb142431862628c63063801f44c152ef154700';
const ECHELON =
  '0xc6bc659f1649553c1a3fa05d9727433dc03843baac29473c817d06d39e7621ba';
const HYPERION =
  '0x8b4a2c4bb53857c718a04c020b98f8c2e1f99a68b0f57389a8bf5434cd22e05c';

// perf_bps = 500. Taken on claimed rewards and claimed LP fees, not on Echelon supply interest.
// https://github.com/DefiLlama/dimension-adapters/blob/master/fees/yield-ai/index.ts
const CLAIM_FEE = 0.05;
const USER_SHARE = 1 - CLAIM_FEE;

const USDC_MARKET =
  '0x2c4e0bb55272f9c120ffd5a414c10244005caf9c1b14527cea3df7074c5bf623';
const USD1_MARKET =
  '0xbb8f38636896c629ff9ef0bf916791a992e12ab4f1c6e26279ee9c6979646963';

const ECHELON_MARKETS_URL =
  'https://app.echelon.market/api/markets?network=aptos_mainnet';
const HYPERION_POOLS_URL = 'https://assets.hyperion.xyz/files/pool-list.json';
const APP_URL = 'https://yieldai.app/';
const SEC_PER_YEAR = 365 * 24 * 60 * 60;
const PAGE_SIZE = 50;
const CALL_CONCURRENCY = 6;

function padAddress(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const hex = addr.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  if (hex === 'a') return '0xa';
  return `0x${hex.padStart(64, '0')}`;
}

function unwrap(raw) {
  return Array.isArray(raw) ? raw[0] : raw;
}

function toBigInt(value) {
  if (value == null) return 0n;
  if (typeof value === 'bigint') return value;
  const text = String(value).trim().split('.')[0];
  if (!/^-?\d+$/.test(text)) return 0n;
  return BigInt(text);
}

function bytesToUtf8(value) {
  if (typeof value === 'string') {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    // A tag is either already text ("hyperion_lp") or the hex of that text.
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      const decoded = Buffer.from(hex, 'hex').toString('utf8');
      if (/^[\x20-\x7e]+$/.test(decoded)) return decoded;
    }
    if (/^[\x20-\x7e]+$/.test(value)) return value;
    return null;
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((n) => Number(n))).toString('utf8');
  }
  return null;
}

function classifyStrategy(ids) {
  // Same priority as the app. Looping and delta-neutral are not these pools.
  if (ids.includes('echelon_looping')) return 'other';
  if (ids.includes('hyperion_lp')) return 'hyperion';
  if (ids.includes('decibel_delta_neutral')) return 'other';
  return 'stable';
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

async function view(functionStr, args = []) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.APTOS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.APTOS_API_KEY}`;
  }
  // 400/abort means the safe has no such position. Retrying it is what made the run take minutes.
  return utils.withRetry(() =>
    axios
      .post(
        'https://api.mainnet.aptoslabs.com/v1/view',
        { function: functionStr, type_arguments: [], arguments: args },
        { headers, timeout: 20000 }
      )
      .then((response) => response.data)
  );
}

function isMissingPosition(error) {
  const body = JSON.stringify(error.response?.data || error.message || '');
  return error.response?.status === 400 || /abort|failed to deserialize|not found/i.test(body);
}

async function fetchSafes() {
  const total = Math.max(0, Number(unwrap(await view(`${VAULT}::vault::get_total_safes`))) || 0);
  const safes = [];
  for (let start = 0; start < total; start += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, total - start);
    const page = unwrap(
      await view(`${VAULT}::vault::get_safes_range_info`, [String(start), String(limit)])
    );
    const rows = Array.isArray(page) ? page : [];
    for (const row of rows) {
      const entry = Array.isArray(row)
        ? { safe_address: row[0], exists: row[3] }
        : row;
      const exists = entry.exists === true || entry.exists === 'true';
      const safe = padAddress(entry.safe_address ?? entry.safeAddress);
      if (exists && safe) safes.push(safe);
    }
  }
  return [...new Set(safes)];
}

async function strategyOf(safe) {
  let raw;
  try {
    raw = unwrap(
      await view(`${VAULT}::strategy_registry::get_safe_active_strategies`, [safe])
    );
  } catch (error) {
    // Untagged safes are the stablecoin compound agent. A missing registry is that case.
    if (isMissingPosition(error)) return 'stable';
    throw error;
  }
  const list = Array.isArray(raw) ? raw : [];
  const ids = list.map(bytesToUtf8).filter((id) => id && id.length > 0);
  return classifyStrategy(ids);
}

function supplyRewardAprs(farming, coins) {
  const rewards = new Map();
  for (const entry of farming?.rewards || []) {
    if (Array.isArray(entry) && entry.length >= 2) rewards.set(entry[0], entry[1]);
  }
  const byMarket = {};
  for (const poolData of farming?.pools?.supply || []) {
    if (!Array.isArray(poolData) || poolData.length < 2) continue;
    const [market, pool] = poolData;
    const coin = coins[market];
    if (!coin?.price || !pool.stakeAmount || pool.stakeAmount <= 0) continue;
    const stakedValue = coin.price * pool.stakeAmount;
    const aprs = [];
    for (const reward of pool.rewards || []) {
      const rewardData = rewards.get(reward.rewardKey);
      if (!reward?.allocPoint || !rewardData?.rewardCoin?.price) continue;
      const now = Date.now() / 1000;
      if (rewardData.startTime > now || rewardData.endTime < now) continue;
      const apr =
        ((rewardData.rewardPerSec / rewardData.totalAllocPoint) *
          reward.allocPoint *
          rewardData.rewardCoin.price *
          SEC_PER_YEAR) /
        stakedValue;
      aprs.push({ address: rewardData.rewardCoin.address, apr });
    }
    if (aprs.length) byMarket[market] = aprs;
  }
  return byMarket;
}

async function echelonRates() {
  const response = (await axios.get(ECHELON_MARKETS_URL, { timeout: 20000 })).data?.data;
  const coins = {};
  for (const market of response?.assets || []) {
    coins[market.market] = market;
  }
  return { coins, rewardAprs: supplyRewardAprs(response?.farming, coins) };
}

function aprToApy(apr) {
  const value = Number(apr);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return (Math.pow(1 + value / 100 / 365, 365) - 1) * 100;
}

async function hyperionRates() {
  const pools =
    (await utils.getEgressData('hyperion/files/pool-list.json', HYPERION_POOLS_URL))?.data || [];
  const byId = new Map();
  for (const pool of pools) {
    const id = padAddress(pool?.pool?.poolId);
    if (id) byId.set(id, pool);
  }
  return byId;
}

async function accountCoins(safe, market) {
  try {
    return toBigInt(unwrap(await view(`${ECHELON}::lending::account_coins`, [safe, market])));
  } catch (error) {
    if (isMissingPosition(error)) return 0n;
    throw error;
  }
}

function unwrapAddresses(raw) {
  const value = unwrap(raw);
  if (!Array.isArray(value)) return [];
  if (value.length === 1 && Array.isArray(value[0])) return value[0];
  return value;
}

async function hyperionAmounts(safe) {
  const exists = unwrap(
    await view(`${VAULT}::vault::hyperion_lp_config_exists`, [safe])
  );
  if (!(exists === true || exists === 'true' || exists === 1 || exists === '1')) return [];
  const positions = unwrapAddresses(
    await view(`${VAULT}::vault::get_hyperion_positions`, [safe])
  );
  const rows = [];
  for (const position of positions) {
    let raw;
    try {
      raw = unwrap(await view(`${VAULT}::vault::get_hyperion_position`, [safe, position]));
    } catch (error) {
      if (isMissingPosition(error)) continue;
      throw error;
    }
    if (!raw || raw.closed === true) continue;
    let amountA = toBigInt(raw.amount_a ?? raw.amountA);
    let amountB = toBigInt(raw.amount_b ?? raw.amountB);
    if (amountA === 0n && amountB === 0n && position) {
      const quoted = await view(`${HYPERION}::router_v3::get_amount_by_liquidity`, [position]);
      if (Array.isArray(quoted)) {
        amountA = toBigInt(quoted[0]);
        amountB = toBigInt(quoted[1]);
      }
    }
    const tokenA = padAddress(raw.token_a?.inner ?? raw.token_a ?? raw.tokenA);
    const tokenB = padAddress(raw.token_b?.inner ?? raw.token_b ?? raw.tokenB);
    const feeTier = Number(raw.fee_tier ?? raw.feeTier ?? 0);
    rows.push({ tokenA, tokenB, amountA, amountB, feeTier });
  }
  return rows;
}

function matchPool(position, ratesById) {
  for (const pool of ratesById.values()) {
    const tokenA = padAddress(pool.pool.token1);
    const tokenB = padAddress(pool.pool.token2);
    const same =
      (position.tokenA === tokenA && position.tokenB === tokenB) ||
      (position.tokenA === tokenB && position.tokenB === tokenA);
    // feeRate 100 = 0.01% (fee tier 0), 500 = 0.05% (fee tier 1)
    const feeRate = Number(pool.pool.feeRate);
    const tier = feeRate >= 500 ? 1 : 0;
    const sameTier = position.feeTier === tier || position.feeTier === feeRate;
    if (same && sameTier) return pool;
  }
  return null;
}

function poolDecimals(pool, token) {
  const tokenA = padAddress(pool.pool.token1);
  const tokenB = padAddress(pool.pool.token2);
  if (token === tokenA) return Number(pool.pool.token1Info?.decimals);
  if (token === tokenB) return Number(pool.pool.token2Info?.decimals);
  return NaN;
}

async function priced(pool, amountsByToken) {
  const tokens = [...amountsByToken.keys()];
  if (!tokens.length) return 0;
  const { pricesByAddress } = await utils.getPrices(tokens, 'aptos');
  let usd = 0;
  for (const [token, amount] of amountsByToken) {
    const price =
      pricesByAddress[token.toLowerCase()] ??
      pricesByAddress[token.replace(/^0x0+/, '0x')];
    const decimals = poolDecimals(pool, token);
    if (!Number.isFinite(price) || !Number.isFinite(decimals)) return null;
    usd += (Number(amount) / 10 ** decimals) * price;
  }
  return usd;
}

async function apy() {
  const [safes, echelon, hyperion] = await Promise.all([
    fetchSafes(),
    echelonRates(),
    hyperionRates(),
  ]);
  const kinds = await mapLimit(safes, CALL_CONCURRENCY, strategyOf);
  const stableSafes = safes.filter((_, i) => kinds[i] === 'stable');
  const hyperionSafes = safes.filter((_, i) => kinds[i] === 'hyperion');

  const supplied = { [USDC_MARKET]: 0n, [USD1_MARKET]: 0n };
  await mapLimit(stableSafes, CALL_CONCURRENCY, async (safe) => {
    const [usdc, usd1] = await Promise.all([
      accountCoins(safe, USDC_MARKET),
      accountCoins(safe, USD1_MARKET),
    ]);
    supplied[USDC_MARKET] += usdc;
    supplied[USD1_MARKET] += usd1;
  });

  const liquidity = new Map();
  await mapLimit(hyperionSafes, CALL_CONCURRENCY, async (safe) => {
    for (const position of await hyperionAmounts(safe)) {
      const pool = matchPool(position, hyperion);
      if (!pool) continue;
      const id = padAddress(pool.pool.poolId);
      if (!liquidity.has(id)) liquidity.set(id, new Map());
      const totals = liquidity.get(id);
      const add = (token, amount) => {
        if (!token || amount <= 0n) return;
        totals.set(token, (totals.get(token) || 0n) + amount);
      };
      add(position.tokenA, position.amountA);
      add(position.tokenB, position.amountB);
    }
  });

  const pools = [];
  for (const market of [USDC_MARKET, USD1_MARKET]) {
    const coin = echelon.coins[market];
    if (!coin) throw new Error(`yield-ai: missing Echelon market ${market}`);
    const tvlUsd = (Number(supplied[market]) / 10 ** coin.decimals) * coin.price;
    const rewards = echelon.rewardAprs[market] || [];
    const apyReward =
      rewards.reduce((sum, reward) => sum + reward.apr, 0) * 100 * USER_SHARE;
    pools.push({
      pool: `${market}-aptos-yield-ai`,
      chain: utils.formatChain('aptos'),
      project: 'yield-ai',
      symbol: coin.symbol,
      tvlUsd,
      apyBase: (coin.supplyApr ?? 0) * 100,
      ...(apyReward > 0
        ? { apyReward, rewardTokens: [...new Set(rewards.map((reward) => reward.address))] }
        : {}),
      underlyingTokens: [coin.faAddress],
      poolMeta: 'Stablecoin compound',
      url: APP_URL,
    });
  }

  for (const [id, amounts] of liquidity) {
    const pool = hyperion.get(id);
    const tvlUsd = await priced(pool, amounts);
    if (tvlUsd == null) continue;
    const rewardTokens = (pool.pool.farm || [])
      .map((item) => item.rewardFa)
      .filter(Boolean);
    const apyReward = aprToApy(pool.farmAPR) * USER_SHARE;
    pools.push({
      pool: `${id}-aptos-yield-ai`,
      chain: utils.formatChain('aptos'),
      project: 'yield-ai',
      symbol: `${pool.pool.token1Info.symbol}-${pool.pool.token2Info.symbol}`,
      tvlUsd,
      apyBase: aprToApy(pool.feeAPR) * USER_SHARE,
      ...(apyReward > 0 ? { apyReward, rewardTokens } : {}),
      underlyingTokens: [pool.pool.token1, pool.pool.token2],
      poolMeta: `Hyperion CLMM ${Number(pool.pool.feeRate) / 10000}%`,
      url: APP_URL,
    });
  }

  return pools.filter((pool) => utils.keepFinite(pool));
}

module.exports = {
  protocolId: '7707',
  timetravel: false,
  apy,
  url: APP_URL,
};
