const utils = require('../utils');

// Shield Swap is a confidential concentrated-liquidity AMM on Aleo.
const ALEO_RPC = 'https://api.provable.com/v2/mainnet';
const AMM = 'shield_swap.aleo';

// The indexer is the only source for per-pool reserves and 24h volume: Shield Swap keeps liquidity in
// public `positions` and `ticks` mappings keyed by a hash, and Aleo mappings cannot be enumerated by
// key, so a pool's reserves cannot be reconstructed from chain state alone.
// https://shield.fi/docs/reference/mappings
const INDEXER = 'https://api.swap.shield.fi';

// The protocol keeps `fee_protocol / 16` of every swap fee and the position keeps the rest.
// https://shield.fi/docs/reference/constants-and-limits
const PROTOCOL_FEE_DENOMINATOR = 16;

// Pool `fee` is a u16 count of parts per million (200 => 0.02%), same source as above.
const FEE_PPM_DENOMINATOR = 1e6;

// Aleo has no on-chain decimal registry - "The AMM uses native token base units directly. It has no
// on-chain decimal scale or normalization registry." (link above) - so the price feed for each
// AMM-side ARC-20 token id is pinned here, matching the Shield Swap TVL adapter.
const COINGECKO_IDS = {
  '724721105858008932013114020280511843613117371369744086165619field': 'aleo',
  '1926848598207449231969field': 'ethereum',
  '2000279227181771747937field': 'solana',
  '469661199361043738096225field': 'bitcoin',
  '212707628815602939926313406778312270053663804591730917421274098438979020915field':
    'usd-coin',
  '692801908703609488185757443979064120926167164195545211519073497257699443field':
    'usd-coin',
  '469367275872013076623969field': 'usd-coin',
  '549647506080797045256801field': 'tether',
};

const aleoMapping = async (mapping, key) =>
  utils.getData(`${ALEO_RPC}/program/${AMM}/mapping/${mapping}/${key}`);

// Aleo plaintext structs come back as `{\n  fee: 200u16,\n  enabled: true\n}`; every field is a
// literal, so one pass over the `name: value` pairs decodes the whole struct. Reading it into a
// plain object keeps the lookups independent of field order and of any field added later.
const ALEO_STRUCT_FIELD = /([a-z_][a-z0-9_]*)\s*:\s*([-\w]+)/gi;

const aleoStruct = (plaintext) => {
  if (typeof plaintext !== 'string')
    throw new Error(
      `shield-swap: expected a mapping plaintext, got ${plaintext}`
    );
  return Object.fromEntries(
    [...plaintext.matchAll(ALEO_STRUCT_FIELD)].map(([, name, value]) => [
      name,
      value,
    ])
  );
};

const aleoNumber = (struct, field) => {
  const literal = struct[field];
  if (literal === undefined)
    throw new Error(
      `shield-swap: ${field} missing from mapping value (read ${
        Object.keys(struct).join(', ') || 'no fields'
      })`
    );
  // Aleo integer literals carry their type as a suffix: `200u16`, `-3i64`.
  const value = Number(literal.replace(/[ui]\d+$/, ''));
  if (!Number.isFinite(value))
    throw new Error(`shield-swap: ${field} is not numeric (${literal})`);
  return value;
};

const apy = async () => {
  const { data: pools } = await utils.getData(`${INDEXER}/pools`);
  const enabled = pools.filter((pool) => pool.enabled);
  const { data: stats } = await utils.getData(
    `${INDEXER}/pools/stats?keys=${enabled.map((pool) => pool.key).join(',')}`
  );

  const coingeckoIds = [
    ...new Set(
      enabled.flatMap((pool) => [
        COINGECKO_IDS[pool.token0],
        COINGECKO_IDS[pool.token1],
      ])
    ),
  ].filter(Boolean);
  if (!coingeckoIds.length) return [];

  const { pricesByAddress: prices } = await utils.getPrices(
    coingeckoIds.map((id) => `coingecko:${id}`)
  );

  // A token listed after this adapter shipped has no id configured, and the price API can omit a
  // configured one. Either way the token is simply unpriceable right now, so report it as such and
  // let the caller drop that pool alone.
  const priceOf = (tokenId) => {
    const price = prices[COINGECKO_IDS[tokenId]];
    return Number.isFinite(price) ? price : null;
  };

  const built = await Promise.all(
    enabled.map(async (pool) => {
      const stat = stats[pool.key];
      // The batch stats endpoint omits pools whose calculation timed out.
      if (!stat) return null;

      const price0 = priceOf(pool.token0);
      const price1 = priceOf(pool.token1);
      // One unpriceable token drops its own pools, never the priceable ones alongside them.
      if (price0 === null || price1 === null) return null;

      // Fee tier and protocol split are read from chain state rather than taken from the indexer.
      const [poolState, slot] = await Promise.all([
        aleoMapping('pools', pool.key),
        aleoMapping('slots', pool.key),
      ]);
      const feePpm = aleoNumber(aleoStruct(poolState), 'fee');
      const feeProtocol = aleoNumber(aleoStruct(slot), 'fee_protocol');

      const decimals0 = pool.token0_info.decimals;
      const decimals1 = pool.token1_info.decimals;

      const tvlUsd =
        (Number(stat.reserve0) / 10 ** decimals0) * price0 +
        (Number(stat.reserve1) / 10 ** decimals1) * price1;

      // volume_24h is the fee-bearing notional of the last 24h, in token0 base units.
      const volumeUsd = (Number(stat.volume_24h) / 10 ** decimals0) * price0;
      const positionFeesUsd =
        ((volumeUsd * feePpm) / FEE_PPM_DENOMINATOR) *
        ((PROTOCOL_FEE_DENOMINATOR - feeProtocol) / PROTOCOL_FEE_DENOMINATOR);

      return {
        pool: `${pool.key}-aleo`,
        chain: utils.formatChain('aleo'),
        project: 'shield-swap',
        symbol: utils.formatSymbol(
          `${pool.token0_info.symbol}-${pool.token1_info.symbol}`
        ),
        tvlUsd,
        apyBase: tvlUsd > 0 ? ((positionFeesUsd * 365) / tvlUsd) * 100 : 0,
        underlyingTokens: [pool.token0, pool.token1],
        // A position is an encrypted PositionNFT record rather than a transferable pool token.
        token: null,
        poolMeta: `${feePpm / (FEE_PPM_DENOMINATOR / 100)}%`,
        url: `https://swap.shield.fi/?pool=${pool.key}`,
        volumeUsd1d: volumeUsd,
      };
    })
  );

  return built.filter(Boolean).filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8477',
  timetravel: false,
  apy,
  url: 'https://swap.shield.fi/',
};
