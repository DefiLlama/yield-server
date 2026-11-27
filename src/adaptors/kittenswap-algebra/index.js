const utils = require('../utils');

const PROJECT = 'kittenswap-algebra';
const CHAIN = 'hyperevm';
const PRICE_CHAIN = 'hyperliquid';
const MIN_TVL_USD = 10000;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const COMMUNITY_FEE_DENOMINATOR = 1000;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ANALYTICS_URL =
  'https://api.goldsky.com/api/public/project_cmcxkn8h7pwwc01x30a5e6t39/subgraphs/cl-analytics-prod/v1.0.2/gn';
const FARMING_URL =
  'https://api.goldsky.com/api/public/project_cmcxkn8h7pwwc01x30a5e6t39/subgraphs/farming-prod/v1.0.0/gn';

const poolsQuery = `
  query getPools($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minTvl }
    ) {
      id
      communityFee
      fee
      totalValueLockedUSD
      token0 { id symbol }
      token1 { id symbol }
      poolDayData(first: 8, orderBy: date, orderDirection: desc) {
        date
        feesUSD
        volumeUSD
      }
    }
  }
`;

const farmingsQuery = `
  query getFarmings($first: Int!, $skip: Int!) {
    eternalFarmings(
      first: $first
      skip: $skip
      where: { isDeactivated: false }
    ) {
      pool
      rewardToken
      bonusRewardToken
      rewardRate
      bonusRewardRate
    }
  }
`;

const tokensQuery = `
  query getTokens($ids: [String!]!) {
    tokens(where: { id_in: $ids }) {
      id
      decimals
    }
  }
`;

const graphql = async (url, query, variables) => {
  const body = await utils.getData(url, { query, variables });
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join('; '));
  }
  return body.data;
};

const paginate = async (url, query, field, variables = {}) => {
  const rows = [];
  const first = 1000;
  let skip = 0;
  while (true) {
    const data = await graphql(url, query, { ...variables, first, skip });
    const page = data[field] || [];
    rows.push(...page);
    if (page.length < first) break;
    skip += first;
  }
  return rows;
};

// rewardRate is an integer tokens-per-second with `decimals` places.
// Values can exceed Number.MAX_SAFE_INTEGER, so scale with BigInt.
const tokensPerSecond = (rateRaw, decimals) => {
  let rate;
  try {
    rate = BigInt(rateRaw || '0');
  } catch {
    return 0;
  }
  if (rate <= 0n) return 0;
  const scale = 10n ** BigInt(decimals);
  return Number(rate / scale) + Number(rate % scale) / Number(scale);
};

const dayStart = () => Math.floor(Date.now() / 1000 / 86400) * 86400;

async function apy() {
  const [pools, farmings] = await Promise.all([
    paginate(ANALYTICS_URL, poolsQuery, 'pools', {
      minTvl: String(MIN_TVL_USD),
    }),
    paginate(FARMING_URL, farmingsQuery, 'eternalFarmings'),
  ]);

  const rewardAddresses = [
    ...new Set(
      farmings.flatMap((farming) =>
        [farming.rewardToken, farming.bonusRewardToken]
          .map((address) => address?.toLowerCase())
          .filter((address) => address && address !== ZERO_ADDRESS)
      )
    ),
  ];

  const [tokenRows, prices] = await Promise.all([
    rewardAddresses.length
      ? graphql(ANALYTICS_URL, tokensQuery, { ids: rewardAddresses }).then(
          (data) => data.tokens || []
        )
      : [],
    rewardAddresses.length
      ? utils.getPrices(rewardAddresses, PRICE_CHAIN)
      : { pricesByAddress: {} },
  ]);

  const decimalsByToken = new Map(
    tokenRows.map((token) => [token.id.toLowerCase(), Number(token.decimals)])
  );

  const rewardsByPool = new Map();
  for (const farming of farmings) {
    const poolId = farming.pool.toLowerCase();
    const components = [
      [farming.rewardToken, farming.rewardRate],
      [farming.bonusRewardToken, farming.bonusRewardRate],
    ];
    for (const [token, rate] of components) {
      const address = token?.toLowerCase();
      if (!address || address === ZERO_ADDRESS) continue;
      const decimals = decimalsByToken.get(address);
      const price = prices.pricesByAddress[address];
      if (!Number.isFinite(decimals) || !Number.isFinite(price)) continue;
      const annualUsd = tokensPerSecond(rate, decimals) * price * SECONDS_PER_YEAR;
      if (!(annualUsd > 0)) continue;
      const entry = rewardsByPool.get(poolId) || {
        annualUsd: 0,
        tokens: new Set(),
      };
      entry.annualUsd += annualUsd;
      entry.tokens.add(address);
      rewardsByPool.set(poolId, entry);
    }
  }

  const today = dayStart();

  return pools
    .map((pool) => {
      const tvlUsd = Number(pool.totalValueLockedUSD);
      if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

      const communityFee = Number(pool.communityFee);
      const lpShare = Number.isFinite(communityFee)
        ? Math.max(0, COMMUNITY_FEE_DENOMINATOR - communityFee) /
          COMMUNITY_FEE_DENOMINATOR
        : 0;

      // feesUSD is the gross swap fee. A missing day means no swaps, so
      // it counts as zero. The current UTC day is still open.
      const byDate = new Map();
      for (const day of pool.poolDayData || []) {
        const date = Number(day.date);
        if (!Number.isFinite(date) || date >= today) continue;
        byDate.set(date, {
          fees: Number(day.feesUSD) || 0,
          volume: Number(day.volumeUSD) || 0,
        });
      }
      const windowDays = Array.from({ length: 7 }, (_, index) => {
        return (
          byDate.get(today - 86400 * (index + 1)) || { fees: 0, volume: 0 }
        );
      });
      const latest = windowDays[0];

      const feeApr = (fees) => (fees * lpShare * 365 * 100) / tvlUsd;
      const result = {
        pool: pool.id.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(
          `${pool.token0.symbol}-${pool.token1.symbol}`
        ),
        tvlUsd,
        underlyingTokens: [pool.token0.id, pool.token1.id].map((id) =>
          id.toLowerCase()
        ),
        poolMeta:
          communityFee >= COMMUNITY_FEE_DENOMINATOR
            ? `${Number(pool.fee) / 10000}% gauged`
            : `${Number(pool.fee) / 10000}%`,
        url: `https://kittenswap.finance/pool/${pool.id.toLowerCase()}/new-position`,
        volumeUsd1d: latest?.volume || 0,
        volumeUsd7d: windowDays
          .slice(0, 7)
          .reduce((sum, day) => sum + day.volume, 0),
      };

      // LPs keep (1000 - communityFee) / 1000. A fully gauged pool pays
      // its swap fee to veKITTEN voters, so it has no base yield.
      if (lpShare > 0) {
        result.apyBase = feeApr(latest.fees);
        const fees7d = windowDays.reduce((sum, day) => sum + day.fees, 0);
        result.apyBase7d = feeApr(fees7d / 7);
      }

      const rewards = rewardsByPool.get(pool.id.toLowerCase());
      if (rewards?.annualUsd > 0) {
        result.apyReward = (rewards.annualUsd / tvlUsd) * 100;
        result.rewardTokens = [...rewards.tokens];
      }

      return result;
    })
    .filter((pool) => {
      if (!pool || !utils.keepFinite(pool)) return false;
      return Math.max(pool.apyBase || 0, pool.apyReward || 0) > 0;
    });
}

module.exports = {
  protocolId: '6622',
  timetravel: false,
  apy,
  url: 'https://kittenswap.finance/pools',
};
