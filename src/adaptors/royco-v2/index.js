const utils = require('../utils');

// Royco serves pools pre-shaped in the DefiLlama schema,
// so this adapter validates/normalises rather than derives.
// Docs: https://vault.api.royco.org/docs#tag/defillama/GET/api/v1/defillama/pools
const API_URL = 'https://vault.api.royco.org/api/v1/defillama/pools';

const PROJECT = 'royco-v2';

// Concrete provides the vault infrastructure behind these two Royco vaults and
// its API lists them, so the `concrete` adapter already emits (and owns) these
// pool ids. A pool id may only belong to one project, so they are skipped here
// to avoid clashing. Drop the entry once `concrete` stops listing the vault.
const POOL_IDS_OWNED_BY_CONCRETE = new Set([
  '0xcd9f5907f92818bc06c9ad70217f089e190d2a32-ethereum', // srRoyUSDC
  '0x41ce72e04d349eb957bdc373baa9c69207032c56-ethereum', // roywstETH
]);

const toNumber = (v) => (Number.isFinite(v) ? v : undefined);

const toAddresses = (v) => {
  if (!Array.isArray(v)) return undefined;
  const out = [
    ...new Set(
      v
        .filter((a) => typeof a === 'string' && a.trim())
        .map((a) => a.toLowerCase())
    ),
  ];
  return out.length ? out : undefined;
};

const toText = (v) =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

// The upstream payload is third-party controlled, so fields are picked
// explicitly: an unexpected key added upstream would otherwise fail the
// adapter's "allowed field names" test on the next run.
const normalize = (p) => {
  const poolId = toText(p.pool)?.toLowerCase();
  const chain = toText(p.chain);
  const symbol = toText(p.symbol);
  if (!poolId || !chain || !symbol) return null;
  if (POOL_IDS_OWNED_BY_CONCRETE.has(poolId)) return null;

  const rewardTokens = toAddresses(p.rewardTokens);
  const apyReward = toNumber(p.apyReward);

  const token = poolId.split('-')[0];

  const pricePerShare = toNumber(p.sharePrice);

  return {
    pool: poolId,
    chain: utils.formatChain(chain),
    project: PROJECT,
    symbol,
    tvlUsd: toNumber(p.tvlUsd),
    apyBase: toNumber(p.apyBase),
    ...(token && { token }),
    ...(pricePerShare > 0 && { pricePerShare }),
    // apyReward is only valid alongside the tokens paying it
    ...(apyReward !== undefined && rewardTokens && { apyReward, rewardTokens }),
    ...(toAddresses(p.underlyingTokens) && {
      underlyingTokens: toAddresses(p.underlyingTokens),
    }),
    ...(toText(p.poolMeta) && { poolMeta: toText(p.poolMeta) }),
    ...(toText(p.url) && { url: toText(p.url) }),
  };
};

const apy = async () => {
  const data = await utils.withRetry(() => utils.getData(API_URL));

  if (!Array.isArray(data) || !data.length) {
    throw new Error(
      `royco-v2: expected a non-empty array from ${API_URL}, got ${
        Array.isArray(data) ? 'an empty array' : typeof data
      }`
    );
  }

  const pools = utils
    .removeDuplicates(data.map(normalize).filter(Boolean))
    .filter(utils.keepFinite);

  if (!pools.length) {
    throw new Error(
      `royco-v2: no valid pools left after filtering ${data.length} entries`
    );
  }

  return pools;
};

module.exports = {
  protocolId: '7425',
  timetravel: false,
  apy,
  url: 'https://royco.org',
};
