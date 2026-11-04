const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { epochOf, validateBudget, poolRate, goodPrice } = require('./math');

const CHAIN = 'robinhood';
const FABLES = '0xb63d07cef74be747231d601bb2faa6b252c68106';
const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const ZERO = '0x0000000000000000000000000000000000000000';
const REGISTRY = '0x159a113e012593d9b3cc63ad45e30f0467e13ef3';
const VOTER = '0x71570b34d9200ffe5c3066f5a204f91229e7338e';
const STREAM = '0x4aa54fa62bc8f6052fb4d3494a3fa79741bda14c';
const POOLS_ABI =
  'function activePools() view returns (tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, bytes32 id, bool active)[])';
const FILES = 'https://fables-proofs.s3.amazonaws.com';
const INDEX = 'https://www.fables.fi/api/indexer';
// Already funded/gauged, but their deposit routes are partners-only. Remove
// each exclusion when its public market opens. Registry activation alone is
// not a statement that the public app offers that market.
const PARTNER_ONLY = new Set([
  '0x8667dc01c5ea8b95d52d17f80ba0298a75d4ca985a1d33118c34af10831db1ad',
  '0xf4c94a3a8ff5b7ffd85f75300779ea5a6aeab1b8f5d4898670da8d1ec1069b94',
]);
const priceAddress = (token) => (token === ZERO ? WETH : token);

async function json(url, indexer = false) {
  const r = await axios.get(url, { timeout: 20000 });
  if (indexer) {
    // This public route is a fixed-query proxy to Envio, not a computed APR API.
    // Refuse its outage fallback and old CDN copies; do not advertise stale yield.
    return indexData(r);
  }
  return r.data;
}

function indexData(r) {
  const age = Number(r.headers.age ?? 0);
  if (
    r.headers['x-fables-held'] === '1' ||
    !Number.isFinite(age) ||
    age > 300 ||
    age < 0
  )
    throw Error(
      `Stale Fables index response (age=${age}, held=${
        r.headers['x-fables-held'] === '1'
      })`
    );
  if (!r.data?.data || r.data.errors?.length)
    throw Error('Incomplete Fables index response');
  return r.data.data;
}

// Never join offset pages while the range set is changing. Split a saturated
// query by pool so each pool's complete book and price come from ONE response.
async function books(ids, get = json) {
  if (!ids.length) return [];
  const d = await get(
    `${INDEX}?op=stakeddepth&ids=${ids.join(',')}&off=0`,
    true
  );
  if (!Array.isArray(d.Range) || !Array.isArray(d.Pool))
    throw Error('Missing range book');
  if (d.Range.length >= 1000) {
    if (ids.length === 1) throw Error('Range book exceeds public query limit');
    const mid = Math.ceil(ids.length / 2);
    // Sequential, bounded: do not burst at the shared indexer.
    return [
      ...(await books(ids.slice(0, mid), get)),
      ...(await books(ids.slice(mid), get)),
    ];
  }
  return ids.map((id) => {
    const pool = d.Pool.find((p) => p.id === id);
    if (!pool) throw Error(`Missing indexed pool ${id}`);
    return { pool, ranges: d.Range.filter((r) => r.pool_id === id) };
  });
}

async function snapshot() {
  const timestamp = Math.floor(Date.now() / 1000);
  const head = await json(`${INDEX}?op=head`, true);
  const block = Number(head.chain_metadata?.[0]?.latest_processed_block);
  if (!Number.isSafeInteger(block) || block <= 0)
    throw Error('Missing indexed head');
  const provider = sdk.getProvider(CHAIN);
  const stamp = await provider.getBlock(block);
  if (
    !stamp ||
    timestamp - stamp.timestamp > 300 ||
    stamp.timestamp > timestamp + 30
  )
    throw Error('Indexer behind chain');
  // No previous-epoch fallback during publication/rollover.
  const week = epochOf(timestamp);
  if (epochOf(stamp.timestamp) !== week)
    throw Error('Indexer has not crossed the epoch boundary');
  const pointer = await json(`${FILES}/launch-config.json`);
  const base = pointer.budgetFilesUrl;
  if (
    typeof base !== 'string' ||
    !base.startsWith(`${FILES}/`) ||
    !base.endsWith('/budgets')
  )
    throw Error('Unrecognised budget source');
  const budget = validateBudget(await json(`${base}/${week}.json`), timestamp);
  const api = new sdk.ChainApi({ chain: CHAIN, block });
  const registry = await api.call({ target: REGISTRY, abi: POOLS_ABI });
  const ceiling = await api.call({
    target: STREAM,
    abi: 'function weeklyBudget(uint256) view returns (uint256)',
    params: [week],
  });
  if (BigInt(ceiling) < BigInt(budget.weeklyBudgetOnChain))
    throw Error('Published allocation exceeds on-chain ceiling');
  const pools = registry
    .filter(
      (p) =>
        p.active &&
        !PARTNER_ONLY.has(p.id.toLowerCase()) &&
        BigInt(budget.lpBudgets[p.id.toLowerCase()] ?? '0') > 0n
    )
    .map((p) => ({
      id: p.id.toLowerCase(),
      key: {
        currency0: p.key.currency0.toLowerCase(),
        currency1: p.key.currency1.toLowerCase(),
        hooks: p.key.hooks.toLowerCase(),
        tickSpacing: Number(p.key.tickSpacing),
      },
    }));
  const ids = pools.map((p) => p.id).sort();
  const killed = await api.multiCall({
    target: VOTER,
    abi: 'function isGaugeKilled(bytes32) view returns (bool)',
    calls: ids.map((id) => ({ params: [id] })),
  });
  const earning = await api.multiCall({
    target: VOTER,
    abi: 'function isGaugeEarning(bytes32) view returns (bool)',
    calls: ids.map((id) => ({ params: [id] })),
  });
  const state = new Map(
    ids.map((id, i) => [id, { killed: killed[i], earning: earning[i] }])
  );
  const allBooks = [];
  for (let i = 0; i < ids.length; i += 8)
    allBooks.push(...(await books(ids.slice(i, i + 8))));
  const addresses = [
    ...new Set([
      FABLES,
      ...pools.flatMap((p) => [
        priceAddress(p.key.currency0),
        priceAddress(p.key.currency1),
      ]),
    ]),
  ].sort();
  const prices = {};
  for (let i = 0; i < addresses.length; i += 30) {
    const coins = addresses
      .slice(i, i + 30)
      .map((a) => `${CHAIN}:${a}`)
      .join(',');
    Object.assign(
      prices,
      (await json(utils.getPriceApiUrl(`/prices/current/${coins}`))).coins
    );
  }
  if (!goodPrice(prices[`${CHAIN}:${FABLES}`], timestamp))
    throw Error('FABLES has no fresh price');
  if (epochOf(Date.now() / 1000) !== week)
    throw Error('Epoch changed during collection');
  return {
    timestamp,
    block,
    blockTimestamp: stamp.timestamp,
    week,
    ceiling: String(ceiling),
    budget,
    pools,
    books: allBooks,
    state: Object.fromEntries(state),
    prices,
  };
}

function output(s) {
  validateBudget(s.budget, s.timestamp);
  const result = [],
    diagnostics = [];
  const seen = new Set();
  for (const b of s.books) {
    const p = s.pools.find((p) => p.id === b.pool.id),
      id = b.pool.id;
    if (!p || seen.has(id)) throw Error('Unknown or duplicate pool book');
    seen.add(id);
    const tokens = [p.key.currency0, p.key.currency1].map(priceAddress);
    const coins = tokens.map((t) => s.prices[`${CHAIN}:${t}`]);
    const reward = s.prices[`${CHAIN}:${FABLES}`];
    const row = poolRate({
      ...b,
      budget: s.budget,
      coins,
      reward,
      timestamp: s.timestamp,
      killed: s.state[id].killed,
    });
    if (!row) {
      diagnostics.push({
        pool: id,
        omitted: 'No fresh valuation or positive principal',
      });
      continue;
    }
    result.push({
      pool: `fables-staked-${id}-${CHAIN}`,
      chain: 'Robinhood Chain',
      project: 'fables',
      symbol: coins
        .map((c, i) =>
          [p.key.currency0, p.key.currency1][i] === ZERO ? 'ETH' : c.symbol
        )
        .join('-'),
      tvlUsd: row.tvlUsd,
      apyReward: row.apyReward,
      rewardTokens: [FABLES],
      underlyingTokens: tokens,
      token: null, // ERC-6909 range shares; the hook is NOT an ERC-20 receipt.
      poolMeta: 'Staked CL — in-range pool average APR',
      url: `https://www.fables.fi/deposit/${id}`,
      ...(!s.state[id].earning || s.state[id].killed ? { frozen: true } : {}),
    });
    diagnostics.push({
      pool: id,
      ...row,
      ranges: row.ranges.map((r) => ({
        ...r,
        liquidity: String(r.liquidity),
        depth: String(r.depth),
      })),
    });
  }
  return { pools: result, diagnostics };
}

module.exports = {
  protocolId: '8481',
  timetravel: false,
  apy: async () => output(await snapshot()).pools,
  url: 'https://www.fables.fi/markets',
};
// Kept separate from the public adapter shape for deterministic local tests.
module.exports._test = { books, snapshot, output, indexData };
