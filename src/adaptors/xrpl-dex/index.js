const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

// XRP Ledger AMM pools (XLS-30), the pools behind the XRPL DEX TVL adapter.
//
// Discovery: XRPScan's pool list (listing AMMs on chain needs a full ledger_data walk, far too
// slow for an hourly run on public nodes). Its cached XRP balance is only used to skip pools far
// below the TVL floor; every amount reported here is read from the ledger with amm_info.
//
// Base APY: an AMM keeps its fees in the pool. For these 50/50 constant product pools,
// sqrt(amount * amount2) / LP token supply is the pool value per LP token in the geometric mean
// of the two assets. Price moves and proportional deposits or withdrawals leave it unchanged;
// what the pool keeps from swaps (the trading fee, and anything paid above the AMM curve), the
// fee part of single asset deposits and withdrawals, and auction slot bids (the LP tokens bid
// go back to the AMM) raise it. Its growth between two validated ledgers is the fee yield of an
// LP position (impermanent loss not included), annualised without compounding as in other DEX
// adapters.

const { xrpl } = sdk.chains;

const POOL_LIST_URL = 'https://api.xrpscan.com/api/v1/amm/pools';
const PAGE_SIZE = 5000;
const MIN_TVL_USD = 10_000;
// the list's XRP balances can lag the ledger: read every pool listed at a quarter of the floor or more
const LIST_HINT_FACTOR = 0.25;
// pin reads a few ledgers behind the newest validated ledger, so every endpoint has it
const LEDGER_LAG = 10;
// at least this share of the candidate pools must be read, or the run fails
const MIN_READ_RATIO = 0.9;
const DAY = 86_400;
const YEAR = 365 * DAY;

const XRP = 'XRP';
const RLUSD =
  '524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
// assets with a DefiLlama price; a pool needs at least one of them
const PRICE_KEYS = {
  [XRP]: 'coingecko:ripple',
  [RLUSD]: `ripple:${RLUSD}`,
};

// amm_info amounts: XRP as a drops string, tokens as { currency, issuer, value },
// MPTs as { mpt_issuance_id, value }. XRPScan assets: { currency: 'XRP' } or { currency, issuer }.
const isXrp = (asset) =>
  typeof asset === 'string' || (asset.currency === XRP && !asset.issuer);

const assetKey = (asset) => {
  if (isXrp(asset)) return XRP;
  if (asset.mpt_issuance_id) return asset.mpt_issuance_id;
  return `${asset.currency}.${asset.issuer}`;
};

// XRP stays in drops, the unit the ledger uses for the LP token supply
const amountOf = (side) => Number(typeof side === 'string' ? side : side.value);

const usdValue = (side, prices) => {
  const price = prices[assetKey(side)];
  if (!price) return null;
  return (isXrp(side) ? amountOf(side) / 1e6 : amountOf(side)) * price;
};

// both sides priced: their sum; one side priced: twice that side (the pool is 50/50 by value)
const poolTvlUsd = (amm, prices) => {
  const a = usdValue(amm.amount, prices);
  const b = usdValue(amm.amount2, prices);
  if (a !== null && b !== null) return a + b;
  if (a !== null || b !== null) return 2 * (a ?? b);
  return null;
};

const valuePerLpToken = (amm) => {
  const lpSupply = Number(amm?.lp_token?.value);
  if (!(lpSupply > 0)) return null; // empty pool
  const value =
    (Math.sqrt(amountOf(amm.amount)) * Math.sqrt(amountOf(amm.amount2))) /
    lpSupply;
  return Number.isFinite(value) && value > 0 ? value : null;
};

const feeApy = (valueNow, valueThen, seconds) => {
  if (!valueNow || !valueThen || !(seconds > 0)) return null;
  const growth = valueNow / valueThen - 1;
  // fees never lower the value per LP token; a drop beyond rounding means the pool was emptied
  // and funded again inside the window, so the window says nothing about fees
  if (growth < -1e-9) return null;
  return ((Math.max(growth, 0) * YEAR) / seconds) * 100;
};

// 3 character codes as they are; 40 hex character codes decoded when they are plain ASCII
const symbolOf = (side) => {
  if (isXrp(side)) return XRP;
  if (side.mpt_issuance_id) return side.mpt_issuance_id;
  const code = side.currency;
  if (!/^[0-9A-F]{40}$/i.test(code)) return code;
  const bytes = Buffer.from(code, 'hex');
  // standard format: 12 zero bytes, a 3 character code, 5 zero bytes
  const text = (bytes[0] === 0 ? bytes.subarray(12, 15) : bytes)
    .toString('latin1')
    .replace(/\0+$/, '');
  return /^[\x20-\x7e]+$/.test(text) ? text.trim() : code;
};

const underlyingToken = (side) => {
  if (isXrp(side)) return PRICE_KEYS[XRP];
  return side.mpt_issuance_id ?? `${side.currency}.${side.issuer}`;
};

// a token that uses the code of a priced asset under another issuer would show up under
// that asset's symbol, so its pools are not listed
const PRICED_SYMBOLS = [XRP, 'RLUSD'];
const isCopycat = (side) =>
  !(assetKey(side) in PRICE_KEYS) &&
  PRICED_SYMBOLS.includes(symbolOf(side).toUpperCase());

const listPools = async () => {
  const pools = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await utils.withRetry(() =>
      axios.get(POOL_LIST_URL, {
        params: { limit: PAGE_SIZE, offset },
        timeout: 60_000,
      })
    );
    if (!Array.isArray(data))
      throw new Error('xrpl-dex: unexpected XRPScan pool list response');
    pools.push(...data);
    if (data.length < PAGE_SIZE) return pools;
  }
};

const isCandidate = (pool, xrpPrice) => {
  if (!pool?.Account || !pool.Asset || !pool.Asset2) return false;
  const keys = [assetKey(pool.Asset), assetKey(pool.Asset2)];
  if (!keys.some((key) => key in PRICE_KEYS)) return false;
  // the list carries the pool's XRP balance only; pools without XRP, or without a
  // balance in the list, are always read
  const xrpDrops = pool.Balance == null ? NaN : Number(pool.Balance);
  if (!keys.includes(XRP) || !Number.isFinite(xrpDrops)) return true;
  return (2 * xrpDrops * xrpPrice) / 1e6 >= MIN_TVL_USD * LIST_HINT_FACTOR;
};

// null when the account is not an AMM at that ledger: created later, or deleted since
const getAmm = async (account, ledgerIndex) => {
  try {
    const { amm } = await xrpl.rpc(
      'amm_info',
      { amm_account: account },
      { ledgerIndex }
    );
    return amm;
  } catch (e) {
    if (e?.error === 'actMalformed' || e?.error === 'actNotFound') return null;
    throw e;
  }
};

// a pool younger than the window gets no value for it; a failed read is counted in `errors`
const valueAt = (account, ledger, errors) =>
  getAmm(account, ledger.number).then(valuePerLpToken, (e) => {
    errors.push(`${account} at ${ledger.number}: ${e.message}`);
    return null;
  });

const apy = async () => {
  const coins = await utils.getPriceApiCoins(Object.values(PRICE_KEYS));
  const prices = Object.fromEntries(
    Object.entries(PRICE_KEYS).map(([asset, key]) => [asset, coins[key]?.price])
  );
  for (const asset of Object.keys(PRICE_KEYS))
    if (!(prices[asset] > 0))
      throw new Error(`xrpl-dex: no price for ${PRICE_KEYS[asset]}`);

  const listed = await listPools();
  const candidates = [
    ...new Set(
      listed.filter((p) => isCandidate(p, prices[XRP])).map((p) => p.Account)
    ),
  ];
  if (!candidates.length) throw new Error('xrpl-dex: no pools listed');

  const latest = await xrpl.getLatestLedger();
  const now = await xrpl.getLedger({ ledgerIndex: latest.number - LEDGER_LAG });

  let deleted = 0;
  const failed = [];
  const amms = await Promise.all(
    candidates.map((account) =>
      getAmm(account, now.number).then(
        (amm) => {
          if (!amm) deleted++;
          return amm;
        },
        (e) => {
          failed.push(`${account}: ${e.message}`);
          return null;
        }
      )
    )
  );
  if (failed.length) console.error('xrpl-dex: amm_info failed', failed);
  const expected = candidates.length - deleted;
  if (expected - failed.length < expected * MIN_READ_RATIO)
    throw new Error(
      `xrpl-dex: ${failed.length} of ${expected} pools unreadable at ${now.number}`
    );

  const pools = amms
    .filter((amm) => amm && !isCopycat(amm.amount) && !isCopycat(amm.amount2))
    .map((amm) => ({ amm, tvlUsd: poolTvlUsd(amm, prices) }))
    .filter((p) => p.tvlUsd >= MIN_TVL_USD);

  const [dayAgo, weekAgo] = await Promise.all(
    [DAY, 7 * DAY].map((seconds) =>
      xrpl.getLedgerAtTimestamp({ timestamp: now.timestamp - seconds })
    )
  );

  const dayErrors = [];
  const weekErrors = [];
  const rows = await Promise.all(
    pools.map(async ({ amm, tvlUsd }) => {
      const [valueDayAgo, valueWeekAgo] = await Promise.all([
        valueAt(amm.account, dayAgo, dayErrors),
        valueAt(amm.account, weekAgo, weekErrors),
      ]);
      const valueNow = valuePerLpToken(amm);
      return {
        pool: `${amm.account}-xrpl`,
        chain: utils.formatChain('ripple'),
        project: 'xrpl-dex',
        symbol: `${symbolOf(amm.amount)}-${symbolOf(amm.amount2)}`,
        tvlUsd,
        apyBase: feeApy(
          valueNow,
          valueDayAgo,
          now.timestamp - dayAgo.timestamp
        ),
        apyBase7d: feeApy(
          valueNow,
          valueWeekAgo,
          now.timestamp - weekAgo.timestamp
        ),
        underlyingTokens: [
          underlyingToken(amm.amount),
          underlyingToken(amm.amount2),
        ],
        poolMeta: `${amm.trading_fee / 1000}% fee`,
        token: `${amm.lp_token.currency}.${amm.account}`,
        url: `https://livenet.xrpl.org/amm/${amm.account}`,
      };
    })
  );

  // a pool with no 24h value is dropped below, so broad read failures must fail the run
  for (const errors of [dayErrors, weekErrors]) {
    if (errors.length) console.error('xrpl-dex: history reads failed', errors);
    if (errors.length > pools.length * (1 - MIN_READ_RATIO))
      throw new Error(
        `xrpl-dex: ${errors.length} of ${pools.length} history reads failed`
      );
  }

  return rows.filter(utils.keepFinite);
};

module.exports = {
  protocolId: '4924',
  timetravel: false,
  apy,
  url: 'https://livenet.xrpl.org/amms',
};
