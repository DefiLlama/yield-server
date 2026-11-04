const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { epochOf, validateBudget, poolRate } = require('./math');

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
// Priced by CoinGecko id: the coins API does not resolve these Robinhood Chain
// addresses yet, although CoinGecko lists them on the chain.
const COINGECKO = {
  [FABLES]: 'fables',
  '0xe258427467c5d5ed73b1d0c838cbc2d140fb88e9': 'universal-layerbank-token',
  '0x812486eaea648819853f8e372dc9f1516c7868bd': 'ubik',
  '0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a': 'zzz-2',
  '0xd9db30bb0d2b8d2eae3826a1372117e058791e18': 'memory-cow-moo',
  '0x6ddb8541af17dadea47df41d1c13faf8deee1902': 'kaskad',
  '0xfce34d21a92069100e3226638140706cf03a266e': 'goldstein',
  '0xa3b6aee90017b72c0812dc1e013de70eb2917ba3': 'earn',
  '0xa156048aa84d13b1de40dfa8288d28b2593fc35c': 'crossbow-finance',
  '0x378a50eac56f45fb74e4ce7f1962dbca33515c14': 'meridian-capital'
};
const erc20 = token => (token === ZERO ? WETH : token);
const priceKey = token =>
  COINGECKO[token] ? `coingecko:${COINGECKO[token]}` : `${CHAIN}:${token}`;

async function get(url) {
  return (await axios.get(url, { timeout: 20000 })).data;
}

// Fixed-query proxy in front of the Fables Envio indexer. A held copy is what
// the proxy serves while the indexer is down; never report yields from it.
async function index(params) {
  const r = await axios.get(`${INDEX}?${params}`, { timeout: 20000 });
  if (
    r.headers['x-fables-held'] === '1' ||
    !r.data?.data ||
    r.data.errors?.length
  )
    throw Error('Fables indexer unavailable');
  return r.data.data;
}

// Staked range books. The proxy caps a response at 1000 ranges; a saturated
// query is split by pool so each pool's book and price come from one response.
async function books(ids) {
  if (!ids.length) return [];
  const d = await index(`op=stakeddepth&ids=${ids.join(',')}&off=0`);
  if (!Array.isArray(d.Range) || !Array.isArray(d.Pool))
    throw Error('Missing range book');
  if (d.Range.length >= 1000) {
    if (ids.length === 1) throw Error('Range book exceeds query limit');
    const mid = Math.ceil(ids.length / 2);
    return [
      ...(await books(ids.slice(0, mid))),
      ...(await books(ids.slice(mid)))
    ];
  }
  return ids.map(id => {
    const pool = d.Pool.find(p => p.id === id);
    if (!pool) throw Error(`Missing indexed pool ${id}`);
    return { pool, ranges: d.Range.filter(r => r.pool_id === id) };
  });
}

async function apy() {
  const week = epochOf(Math.floor(Date.now() / 1000));
  const base = (await get(`${FILES}/launch-config.json`)).budgetFilesUrl;
  if (typeof base !== 'string' || !base.startsWith(`${FILES}/`))
    throw Error('Unrecognised budget source');
  const budget = validateBudget(await get(`${base}/${week}.json`), week);

  const api = new sdk.ChainApi({ chain: CHAIN });
  const registry = await api.call({ target: REGISTRY, abi: POOLS_ABI });
  const ceiling = await api.call({
    target: STREAM,
    abi: 'function weeklyBudget(uint256) view returns (uint256)',
    params: [week]
  });
  if (BigInt(ceiling) < BigInt(budget.weeklyBudgetOnChain))
    throw Error('Published allocation exceeds on-chain weekly budget');
  const pools = registry
    .filter(
      p => p.active && BigInt(budget.lpBudgets[p.id.toLowerCase()] ?? '0') > 0n
    )
    .map(p => ({
      id: p.id.toLowerCase(),
      tokens: [p.key.currency0, p.key.currency1].map(t => t.toLowerCase())
    }));
  const ids = pools.map(p => p.id).sort();
  const [killed, earning] = await Promise.all(
    ['isGaugeKilled', 'isGaugeEarning'].map(fn =>
      api.multiCall({
        target: VOTER,
        abi: `function ${fn}(bytes32) view returns (bool)`,
        calls: ids.map(id => ({ params: [id] }))
      })
    )
  );
  const state = Object.fromEntries(
    ids.map((id, i) => [id, { killed: killed[i], earning: earning[i] }])
  );

  const tokens = [...new Set(pools.flatMap(p => p.tokens.map(erc20)))].sort();
  const [decimals, symbols] = await Promise.all(
    ['erc20:decimals', 'erc20:symbol'].map(abi =>
      api.multiCall({ abi, calls: tokens.map(target => ({ target })) })
    )
  );
  const meta = Object.fromEntries(
    tokens.map((t, i) => [
      t,
      { decimals: Number(decimals[i]), symbol: symbols[i] }
    ])
  );
  const keys = [...new Set([FABLES, ...tokens].map(priceKey))];
  const prices = {};
  for (let i = 0; i < keys.length; i += 30) {
    const batch = await get(
      utils.getPriceApiUrl(`/prices/current/${keys.slice(i, i + 30).join(',')}`)
    );
    Object.assign(prices, batch.coins);
  }
  const coin = t => {
    const price = prices[priceKey(t)];
    return price && { price: price.price, decimals: meta[t].decimals };
  };
  const reward = coin(FABLES);

  const allBooks = [];
  for (let i = 0; i < ids.length; i += 8)
    allBooks.push(...(await books(ids.slice(i, i + 8))));

  return allBooks
    .map(b => {
      const id = b.pool.id;
      const p = pools.find(p => p.id === id);
      const tokens = p.tokens.map(erc20);
      const row = poolRate({
        ...b,
        budget,
        coins: tokens.map(coin),
        reward,
        killed: state[id].killed
      });
      if (!row) return null; // unpriced token or nothing staked
      return {
        pool: `fables-staked-${id}-${CHAIN}`,
        chain: 'Robinhood Chain',
        project: 'fables',
        symbol: p.tokens
          .map(t => (t === ZERO ? 'ETH' : meta[t].symbol))
          .join('-'),
        tvlUsd: row.tvlUsd,
        apyReward: row.apyReward,
        rewardTokens: [FABLES],
        underlyingTokens: tokens,
        token: null, // ERC-6909 range shares, no ERC-20 receipt
        poolMeta: 'Staked CL (in-range average)',
        url: `https://www.fables.fi/deposit/${id}`,
        // Staking is refused while the gauge is killed or has no live votes.
        ...(state[id].killed || !state[id].earning ? { frozen: true } : {})
      };
    })
    .filter(Boolean);
}

module.exports = {
  protocolId: '8481',
  timetravel: false,
  apy,
  url: 'https://www.fables.fi/markets'
};
