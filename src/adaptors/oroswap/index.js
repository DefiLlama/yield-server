const axios = require('axios');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const LCD_ENDPOINT = 'https://public-zigchain-lcd.numia.xyz';
const RPC_ENDPOINT = 'https://oroswap-zigchain-rpc.cryptocomics.cc';
const FACTORY_CONTRACT =
  'zig1xx3aupmgv3ce537c0yce8zzd3sz567syaltr2tdehu3y803yz6gsc6tz85';
const VALDORA_STAKER_CONTRACT =
  'zig18nnde5tpn76xj3wm53n0tmuf3q06nruj3p6kdemcllzxqwzkpqzqk7ue55';

const APP_URL = 'https://app.oroswap.org/pools';
const CHAIN = 'ZIGChain';
const PROJECT = 'oroswap';
const PAGE_SIZE = 30;
const REQUEST_DELAY_MS = 10;
const TX_SEARCH_PER_PAGE = 100;
const EXACT_TX_LIMIT = 100;
const APY_SCAN_CONCURRENCY = 3;
const RPC_TIMEOUT_MS = 10_000;

const WHITELISTED_POOLS = new Set([
  'zig1h72z8ptvcdqvuvy2lqanupwtextjmjmktj2ejgne2padxk0z8zds48shzq', // stZIG-ZIG
  'zig186ucx5mtdq6ams8rsvvcu7yfw5lhtxue8ykdkyqvlnk3gpc77lasw8373h', // USDC-ZIG
  'zig15sllxl4qevqdfpfuzdelvqldd3qsxjx9u2lrwkkrsh8hpuu97rqs63fsl7', // stATOM-ATOM
  'zig1ucwnlul7t97fx4xr83kzxt76pdgk86gmz36adl8mzk890frduwuslq09t6', // USDT-ZIG
  'zig12uxfwsdsl7jrjrmuunflz4avqc34myaqtv8s84mcfryl49kc6qeqtdz5me', // WBTC-ZIG
  'zig1wvqk2tm38dn3yp9ry7h5zzjqv3tytzpwpkkg55w3j58cdhvqrnfq78fe45', // ZIG-ATOM
]);

const UZIG = 'uzig';
const STZIG =
  'coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig';
const USDC =
  'ibc/6490A7EAB61059BFC1CDDEB05917DD70BDF3A611654162A1A47DB930D40D8AF4';

const TOKENS = {
  [UZIG]: { symbol: 'ZIG', decimals: 6, priceKey: 'zigchain:uzig' },
  [STZIG]: { symbol: 'stZIG', decimals: 6, priceKey: `zigchain:${STZIG}` },
  [USDC]: { symbol: 'USDC', decimals: 6, priceKey: 'coingecko:usd-coin' },
  ibc: {
    'EF48E6B1A1A19F47ECAEA62F5670C37C0580E86A9E88498B7E393EB6F49F33C0': {
      symbol: 'ATOM',
      decimals: 6,
      priceKey: 'coingecko:cosmos',
    },
    '729AE368985B0F7B35648D17BA74A3D0A1C833FBAE8C3B49D75C6A2B578B9930': {
      symbol: 'stATOM',
      decimals: 6,
      priceKey: 'coingecko:stride-staked-atom',
    },
    '5E970F9FF7B696B42F75B92CC05A74B9C44AB0B5D231FBE794A29D74344B19D7': {
      symbol: 'ETH',
      decimals: 18,
      priceKey: 'coingecko:ethereum',
    },
    '7B02D9C0746D2D6551CD358D4C7ABAC6EE94527D613BACFDEE122559CEB41AA4': {
      symbol: 'WBTC',
      decimals: 8,
      priceKey: 'coingecko:wrapped-bitcoin',
    },
    '630F28419AFD118B9EA8B96AE9D280CFDA4EB9FAB3108F1CA9E7DC00F396B4F9': {
      symbol: 'USDT',
      decimals: 6,
      priceKey: 'coingecko:tether',
    },
    CC5268F89C752A4BDCBDAA574AF0A381786FCC839104E077DA9A9145176BF8ED: {
      symbol: 'EURC',
      decimals: 6,
      priceKey: 'coingecko:euro-coin',
    },
    '294719272CB20610F3C0173B0E14DD65F9D7F515548AB3F8373CC91F36357234': {
      symbol: 'XAUt',
      decimals: 6,
      priceKey: 'coingecko:tether-gold',
    },
    F1E29C7A6E0A3782CD87D279722AC11FEDE1BAAB9BD5A25A2A7EAE44ED02ADD5: {
      symbol: 'SolvBTC',
      decimals: 18,
      priceKey: 'coingecko:solv-btc',
    },
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size)
    chunks.push(array.slice(i, i + size));
  return chunks;
};

const mapLimit = async (items, limit, mapper) => {
  const results = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  });

  await Promise.all(workers);
  return results;
};

const withRetry = async (fn, attempts = 3) => {
  let lastError;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(500 * (i + 1));
    }
  }

  throw lastError;
};

const getAssetDenom = (asset) =>
  asset?.native_token?.denom ||
  asset?.token?.contract_addr ||
  asset?.info?.native_token?.denom ||
  asset?.info?.token?.contract_addr ||
  null;

const queryContract = async (contract, data) => {
  const payload = JSON.stringify(data);
  const encoded = Buffer.from(payload).toString('base64');
  const endpoint = `${LCD_ENDPOINT}/cosmwasm/wasm/v1/contract/${contract}/smart/${encoded}`;
  const result = await withRetry(() => utils.getData(endpoint));
  return result?.data?.data ?? result?.data;
};

const getData = (url) => withRetry(() => utils.getData(url));

const fetchPairs = async () => {
  const pairs = [];
  let startAfter;

  while (true) {
    const query = { pairs: { limit: PAGE_SIZE } };
    if (startAfter) query.pairs.start_after = startAfter;

    const data = await queryContract(FACTORY_CONTRACT, query);
    const page = data?.pairs || [];
    if (page.length === 0) break;

    pairs.push(
      ...page.filter((pair) => WHITELISTED_POOLS.has(pair.contract_addr))
    );
    if (page.length < PAGE_SIZE) break;

    const last = page[page.length - 1];
    startAfter = {
      asset_infos: last.asset_infos,
      pair_type: last.pair_type,
    };
    await sleep(REQUEST_DELAY_MS);
  }

  return pairs;
};

const getPairType = (pairType) => {
  if (!pairType) return null;
  if (pairType.xyk !== undefined) return 'XYK';
  if (pairType.stable !== undefined) return 'Stable';
  if (pairType.custom) return String(pairType.custom).toUpperCase();
  return null;
};

const getToken = (denom) => {
  if (TOKENS[denom]) return TOKENS[denom];
  if (denom?.startsWith('coin.')) {
    const symbol = denom.split('.').pop();
    return { symbol, decimals: 6 };
  }
  if (denom?.startsWith('ibc/')) {
    const token = TOKENS.ibc[denom.slice(4)];
    if (token) return token;
    return { symbol: denom.slice(0, 10), decimals: 6 };
  }
  return { symbol: denom || 'UNKNOWN', decimals: 6 };
};

const getPoolSymbol = (denoms) =>
  denoms.map((denom) => getToken(denom).symbol).join('-');

const fetchPrices = async (denoms) => {
  const priceKeysByDenom = new Map();

  for (const denom of denoms) {
    const token = getToken(denom);
    if (token.priceKey) {
      priceKeysByDenom.set(denom, token.priceKey);
    } else if (denom && !denom.includes('/')) {
      priceKeysByDenom.set(denom, `zigchain:${denom}`);
    }
  }

  const prices = new Map();
  const priceKeys = [...new Set(priceKeysByDenom.values())];
  const priceData = { coins: {} };

  for (const chunk of chunkArray(priceKeys, 25)) {
    const data = await utils.getPriceApiData(`/prices/current/${chunk.join(',')}`);
    Object.assign(priceData.coins, data.coins);
  }

  for (const [denom, priceKey] of priceKeysByDenom) {
    const price = priceData.coins?.[priceKey]?.price;
    if (price) prices.set(denom, price);
  }

  try {
    const probeUzig = '1000000000';
    const quote = await queryContract(VALDORA_STAKER_CONTRACT, {
      reverse_st_zig_price: { amount: probeUzig },
    });

    if (
      !prices.has(STZIG) &&
      prices.has(UZIG) &&
      quote?.stzig_amount &&
      quote.stzig_amount !== '0'
    ) {
      const uzigPerStzig = new BigNumber(probeUzig).div(quote.stzig_amount);
      prices.set(STZIG, uzigPerStzig.times(prices.get(UZIG)).toNumber());
    }
  } catch (e) {
    // stZIG pools can still be valued when paired with another priced asset.
  }

  return prices;
};

const normalizeAmount = (amount, denom) =>
  new BigNumber(amount || 0).shiftedBy(-getToken(denom).decimals);

const addDerivedPrices = (pools, prices) => {
  for (let i = 0; i < 5; i++) {
    let added = false;

    for (const pool of pools) {
      if (pool.assets.length !== 2) continue;

      const [a, b] = pool.assets;
      const priceA = prices.get(a.denom);
      const priceB = prices.get(b.denom);
      if ((priceA && priceB) || (!priceA && !priceB)) continue;

      const amountA = normalizeAmount(a.amount, a.denom);
      const amountB = normalizeAmount(b.amount, b.denom);
      if (amountA.lte(0) || amountB.lte(0)) continue;

      if (priceA && !priceB) {
        prices.set(b.denom, amountA.times(priceA).div(amountB).toNumber());
        added = true;
      } else if (!priceA && priceB) {
        prices.set(a.denom, amountB.times(priceB).div(amountA).toNumber());
        added = true;
      }
    }

    if (!added) break;
  }
};

const getTvlUsd = (assets, prices) =>
  assets.reduce((sum, asset) => {
    const price = prices.get(asset.denom);
    if (!price) return sum;
    return sum.plus(normalizeAmount(asset.amount, asset.denom).times(price));
  }, new BigNumber(0));

const getLatestBlockInfo = async () => {
  const latest = await getData(
    `${LCD_ENDPOINT}/cosmos/base/tendermint/v1beta1/blocks/latest`
  );
  const latestHeight = Number(latest.block.header.height);
  const latestTime = new Date(latest.block.header.time).getTime();
  const sampleHeight = Math.max(1, latestHeight - 10_000);
  const sample = await getData(
    `${LCD_ENDPOINT}/cosmos/base/tendermint/v1beta1/blocks/${sampleHeight}`
  );
  const sampleTime = new Date(sample.block.header.time).getTime();
  const avgBlockSeconds =
    (latestTime - sampleTime) / 1000 / (latestHeight - sampleHeight);

  return { latestHeight, avgBlockSeconds };
};

const txSearch = async ({ contract, startHeight, page, perPage }) => {
  const params = new URLSearchParams({
    query: JSON.stringify(
      `tx.height>${startHeight} AND wasm.action='swap' AND wasm._contract_address='${contract}'`
    ),
    page: String(page),
    per_page: String(perPage),
    order_by: JSON.stringify('desc'),
  });
  const { data } = await withRetry(() =>
    axios.get(`${RPC_ENDPOINT}/tx_search?${params.toString()}`, {
      timeout: RPC_TIMEOUT_MS,
    })
  );
  return data?.result || { total_count: '0', txs: [] };
};

const getEventAttributes = (event) =>
  Object.fromEntries((event.attributes || []).map(({ key, value }) => [key, value]));

const parseSwapEvents = (tx, contract, prices) => {
  const out = {
    feesUsd: new BigNumber(0),
    volumeUsd: new BigNumber(0),
    swaps: 0,
  };

  for (const event of tx.tx_result?.events || []) {
    if (event.type !== 'wasm') continue;
    const attrs = getEventAttributes(event);
    if (attrs._contract_address !== contract || attrs.action !== 'swap') continue;

    const askPrice = prices.get(attrs.ask_asset);
    const offerPrice = prices.get(attrs.offer_asset);
    const commission = new BigNumber(attrs.commission_amount || 0);
    const makerFee = new BigNumber(attrs.maker_fee_amount || 0);
    const feeShare = new BigNumber(attrs.fee_share_amount || 0);
    const lpFee = BigNumber.max(commission.minus(makerFee).minus(feeShare), 0);

    if (askPrice) {
      out.feesUsd = out.feesUsd.plus(
        normalizeAmount(lpFee, attrs.ask_asset).times(askPrice)
      );
    }
    if (offerPrice) {
      out.volumeUsd = out.volumeUsd.plus(
        normalizeAmount(attrs.offer_amount || 0, attrs.offer_asset).times(
          offerPrice
        )
      );
    }
    out.swaps++;
  }

  return out;
};

const mergeFeeStats = (a, b) => ({
  feesUsd: a.feesUsd.plus(b.feesUsd),
  volumeUsd: a.volumeUsd.plus(b.volumeUsd),
  swaps: a.swaps + b.swaps,
});

const getSamplePages = (total, perPage) => {
  const totalPages = Math.ceil(total / perPage);
  if (total <= EXACT_TX_LIMIT) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  return [1];
};

const fetchFeeStatsForPeriod = async ({ contract, startHeight, prices }) => {
  const firstPage = await txSearch({
    contract,
    startHeight,
    page: 1,
    perPage: TX_SEARCH_PER_PAGE,
  });
  const total = Number(firstPage.total_count || 0);
  if (!total) {
    return { feesUsd: 0, volumeUsd: 0, swaps: 0 };
  }

  const pages = getSamplePages(total, TX_SEARCH_PER_PAGE);
  let sampledTxs = firstPage.txs || [];

  if (pages.length > 1) {
    const remainingPages = pages.filter((page) => page !== 1);
    const responses = await Promise.all(
      remainingPages.map((page) =>
        txSearch({ contract, startHeight, page, perPage: TX_SEARCH_PER_PAGE })
      )
    );
    sampledTxs = sampledTxs.concat(responses.flatMap((res) => res.txs || []));
  }

  const sampled = sampledTxs.reduce(
    (acc, tx) => mergeFeeStats(acc, parseSwapEvents(tx, contract, prices)),
    { feesUsd: new BigNumber(0), volumeUsd: new BigNumber(0), swaps: 0 }
  );

  const multiplier = total > sampledTxs.length ? total / sampledTxs.length : 1;

  return {
    feesUsd: sampled.feesUsd.times(multiplier).toNumber(),
    volumeUsd: sampled.volumeUsd.times(multiplier).toNumber(),
    swaps: total,
  };
};

const fetchFeeStats = async (pools, prices) => {
  const { latestHeight, avgBlockSeconds } = await getLatestBlockInfo();
  const startHeight1d = Math.max(
    1,
    latestHeight - Math.ceil((24 * 60 * 60) / avgBlockSeconds)
  );
  const poolsToScan = pools.filter((pool) =>
    WHITELISTED_POOLS.has(pool.pair.contract_addr)
  );
  const stats = new Map();

  await mapLimit(poolsToScan, APY_SCAN_CONCURRENCY, async (pool) => {
    try {
      const day = await fetchFeeStatsForPeriod({
        contract: pool.pair.contract_addr,
        startHeight: startHeight1d,
        prices,
      });
      stats.set(pool.pair.contract_addr, { day });
    } catch (e) {
      // Keep the adapter usable if one RPC tx_search call times out.
    }
  });

  return stats;
};

const apy = async () => {
  const pairs = await fetchPairs();

  const pools = (
    await Promise.all(
      pairs.map(async (pair) => {
        try {
          const pool = await queryContract(pair.contract_addr, { pool: {} });
          const assets = (pool?.assets || [])
            .map((asset) => ({
              denom: getAssetDenom(asset.info),
              amount: asset.amount,
            }))
            .filter((asset) => asset.denom);

          if (assets.length === 0) return null;
          return { pair, assets };
        } catch (e) {
          // Skip pools that fail transiently after retries; the factory page remains usable.
          return null;
        }
      })
    )
  ).filter(Boolean);

  const denoms = [
    ...new Set(pools.flatMap((pool) => pool.assets.map((asset) => asset.denom))),
  ];
  const prices = await fetchPrices(denoms);
  addDerivedPrices(pools, prices);

  const pricedPools = pools
    .map(({ pair, assets }) => ({
      pair,
      assets,
      tvlUsd: getTvlUsd(assets, prices).toNumber(),
    }))
    .filter((pool) => Number.isFinite(pool.tvlUsd) && pool.tvlUsd > 0);

  const feeStats = await fetchFeeStats(pricedPools, prices);

  return pricedPools
    .map(({ pair, assets, tvlUsd }) => {
      const denoms = assets.map((asset) => asset.denom);
      const stats = feeStats.get(pair.contract_addr);
      const apyBase =
        stats?.day?.feesUsd && tvlUsd > 0
          ? (stats.day.feesUsd * 365 * 100) / tvlUsd
          : 0;
      const mapped = {
        pool: `${pair.contract_addr}-${CHAIN}`.toLowerCase(),
        chain: CHAIN,
        project: PROJECT,
        symbol: utils.formatSymbol(getPoolSymbol(denoms)),
        tvlUsd,
        apyBase,
        underlyingTokens: denoms,
        url: `${APP_URL}?pool=${pair.contract_addr}`,
      };

      if (stats?.day?.volumeUsd) mapped.volumeUsd1d = stats.day.volumeUsd;

      const pairType = getPairType(pair.pair_type);
      if (pairType) mapped.poolMeta = pairType;

      return mapped;
    })
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  protocolId: '6961',
  apy,
  timetravel: false,
  url: APP_URL,
};
