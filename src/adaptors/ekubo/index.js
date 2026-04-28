const utils = require('../utils');
const { chunk } = require('lodash');

const API_URL = 'https://prod-api.ekubo.org';
const ETHEREUM_CHAIN_ID = '0x1';
const STARKNET_CHAIN_ID = '0x534e5f4d41494e';
const MIN_TVL_USD = 10000;
const TOP_POOL_REQUEST_CONCURRENCY = 5;
const MAX_TOP_POOL_FAILURES = 3;
const Q128 = 1n << 128n;
const Q64 = 1n << 64n;

function normalizeChainId(chainId) {
  return BigInt(chainId).toString();
}

const CHAINS = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    normalizedChainId: normalizeChainId(ETHEREUM_CHAIN_ID),
    chain: 'ethereum',
  },
  {
    chainId: STARKNET_CHAIN_ID,
    normalizedChainId: normalizeChainId(STARKNET_CHAIN_ID),
    chain: 'starknet',
  },
];

function normalizeTokenRef(chainId, address) {
  return `${normalizeChainId(chainId)}:${BigInt(address).toString()}`;
}

function getPairKey(chainId, tokenA, tokenB) {
  const [token0, token1] = [
    normalizeTokenRef(chainId, tokenA),
    normalizeTokenRef(chainId, tokenB),
  ].sort();

  return `${token0}:${token1}`;
}

function getLegacyPoolId(chainId, token0, token1) {
  if (normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)) {
    return `ekubo-${token0.symbol}-${token1.symbol}`;
  }

  return null;
}

function getCanonicalPoolId(chainId, poolInfo) {
  return `ekubo-${formatNumericHex(chainId)}-${formatNumericHex(
    poolInfo.core_address
  )}-${formatNumericHex(poolInfo.pool_id, 64)}`.toLowerCase();
}

function getPoolId(chainId, token0, token1, poolInfo, poolIndex) {
  return (
    (poolIndex === 0 ? getLegacyPoolId(chainId, token0, token1) : null) ??
    getCanonicalPoolId(chainId, poolInfo)
  );
}

function formatNumericHex(value, size = null) {
  if (typeof value === 'string' && value.startsWith('0x')) {
    const hex = value.slice(2).toLowerCase();
    return `0x${size ? hex.padStart(size, '0') : hex}`;
  }

  const hex = BigInt(value).toString(16);
  return `0x${size ? hex.padStart(size, '0') : hex}`;
}

function getPoolUrl(chainId, poolInfo) {
  const chainPath =
    normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)
      ? 'starknet'
      : 'evm';

  return `https://ekubo.org/${chainPath}/charts/pool/${chainId}/${formatNumericHex(
    poolInfo.core_address
  )}/${formatNumericHex(poolInfo.pool_id, 64)}`;
}

function formatFeePercent(chainId, fee) {
  if (fee == null) return null;

  const denominator =
    normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)
      ? Q128
      : Q64;
  const scaledPercent =
    (BigInt(fee) * 10000n + denominator / 2n) / denominator;
  const whole = scaledPercent / 100n;
  const fraction = (scaledPercent % 100n).toString().padStart(2, '0');

  return `${whole.toString()}.${fraction}% fee`;
}

function formatDepthPercent(depthPercent) {
  if (depthPercent == null) return null;

  return `CL range ${((depthPercent || 0) * 100).toFixed(2)}%`;
}

function getPoolMeta(chainId, poolInfo) {
  const parts = [
    formatFeePercent(chainId, poolInfo.fee),
    formatDepthPercent(poolInfo.depth_percent),
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : null;
}

function formatTokenAddress(chainId, address) {
  if (normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)) {
    return utils.padStarknetAddress(address);
  }

  return utils.formatAddress(address);
}

function getAmountUsd(token, amount) {
  if (!token?.usd_price) return 0;

  return (
    (token.usd_price * Number(amount || 0)) / Math.pow(10, Number(token.decimals))
  );
}

function getLiquidityUsd(token0, token1, amount0, amount1) {
  return getAmountUsd(token0, amount0) + getAmountUsd(token1, amount1);
}

function isCampaignActive(campaign, now) {
  const startTime = new Date(campaign.startTime).getTime();
  const endTime = campaign.endTime ? new Date(campaign.endTime).getTime() : Infinity;

  return startTime <= now && now < endTime;
}

function buildCampaignRewards(campaigns, tokenByKey) {
  const now = Date.now();
  const rewardsByPair = new Map();

  for (const campaign of campaigns) {
    if (!isCampaignActive(campaign, now)) continue;

    const rewardToken = tokenByKey[normalizeTokenRef(campaign.chain_id, campaign.rewardToken)];
    if (!rewardToken?.usd_price) continue;

    for (const pair of campaign.pairs) {
      const dailyRewardUsd = getAmountUsd(rewardToken, pair.daily_rewards);
      if (!dailyRewardUsd) continue;

      const depthUsd =
        getAmountUsd(
          tokenByKey[normalizeTokenRef(campaign.chain_id, pair.token0)],
          pair.depth0
        ) +
        getAmountUsd(
          tokenByKey[normalizeTokenRef(campaign.chain_id, pair.token1)],
          pair.depth1
        );

      if (!depthUsd) continue;

      const pairKey = getPairKey(campaign.chain_id, pair.token0, pair.token1);
      const existing = rewardsByPair.get(pairKey) || {
        apyReward: 0,
        rewardTokens: new Set(),
      };

      existing.apyReward += (dailyRewardUsd * 365 * 100) / depthUsd;
      existing.rewardTokens.add(
        formatTokenAddress(campaign.chain_id, rewardToken.address)
      );
      rewardsByPair.set(pairKey, existing);
    }
  }

  return rewardsByPair;
}

async function getChainData({ normalizedChainId }) {
  const query = `chainId=${encodeURIComponent(normalizedChainId)}`;

  const [tokens, pairData, campaigns] = await Promise.all([
    utils.getData(`${API_URL}/tokens?${query}&pageSize=10000`),
    utils.getData(`${API_URL}/overview/pairs?${query}&minTvlUsd=${MIN_TVL_USD}`),
    utils.getData(`${API_URL}/campaigns?${query}`),
  ]);

  const topPoolEntries = [];
  let topPoolFailureCount = 0;
  for (const pairsBatch of chunk(pairData.topPairs, TOP_POOL_REQUEST_CONCURRENCY)) {
    const batchEntries = await Promise.all(
      pairsBatch.map(async (pair) => {
        const pairKey = getPairKey(pair.chain_id, pair.token0, pair.token1);
        try {
          const pools = await utils.getData(
            `${API_URL}/pair/${encodeURIComponent(normalizedChainId)}/${encodeURIComponent(
              pair.token0
            )}/${encodeURIComponent(pair.token1)}/pools?minTvlUsd=${MIN_TVL_USD}`
          );
          const topPools = pools?.topPools || [];
          if (topPools.length === 0) return null;

          return [
            pairKey,
            topPools,
          ];
        } catch (error) {
          console.error(
            `Ekubo top pool fetch failed for chain ${normalizedChainId} pair ${pairKey}: ${error.message}`
          );
          return { error: true, pairKey };
        }
      })
    );
    const failedEntries = batchEntries.filter((entry) => entry?.error);
    topPoolFailureCount += failedEntries.length;

    if (topPoolFailureCount > MAX_TOP_POOL_FAILURES) {
      throw new Error(
        `Ekubo top pool fetch failures exceeded threshold for chain ${normalizedChainId}: ${topPoolFailureCount}`
      );
    }

    topPoolEntries.push(
      ...batchEntries.filter((entry) => entry && !entry.error)
    );
  }

  return {
    tokens,
    pairs: pairData.topPairs,
    topPoolsByPair: new Map(topPoolEntries.filter(([, pools]) => pools?.length)),
    campaigns: campaigns.campaigns,
  };
}

async function apy() {
  const results = await Promise.all(CHAINS.map(getChainData));
  const tokens = results.flatMap((result) => result.tokens);
  const topPoolsByPair = new Map(
    results.flatMap((result) => [...result.topPoolsByPair.entries()])
  );
  const tokenByAddr = {};
  for (const token of tokens) {
    tokenByAddr[normalizeTokenRef(token.chain_id, token.address)] = token;
  }

  const campaignRewards = buildCampaignRewards(
    results.flatMap((result) => result.campaigns),
    tokenByAddr
  );

  return results
    .flatMap((result) => result.pairs)
    .map((p) => {
      const chainId = p.chain_id;
      const t0Key = normalizeTokenRef(chainId, p.token0);
      const t1Key = normalizeTokenRef(chainId, p.token1);
      const token0 = tokenByAddr[t0Key];
      const token1 = tokenByAddr[t1Key];
      if (!token0 || !token1) return;
      const campaignReward =
        campaignRewards.get(getPairKey(chainId, p.token0, p.token1)) || null;
      const topPools = topPoolsByPair.get(getPairKey(chainId, p.token0, p.token1));

      if (!topPools?.length) return [];

      return topPools
        .map((topPool, poolIndex) => {
          const tvlUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.tvl0_total,
            topPool.tvl1_total
          );

          if (tvlUsd < MIN_TVL_USD) return null;

          const feesUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.fees0_24h,
            topPool.fees1_24h
          );
          const depthUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.depth0,
            topPool.depth1
          );

          const apyBase = (feesUsd * 100 * 365) / (depthUsd || tvlUsd);

          return {
            pool: getPoolId(chainId, token0, token1, topPool, poolIndex),
            chain: utils.formatChain(
              CHAINS.find(
                (chain) => chain.normalizedChainId === normalizeChainId(chainId)
              )?.chain ?? chainId
            ),
            project: 'ekubo',
            symbol: `${token0.symbol}-${token1.symbol}`,
            underlyingTokens: [
              formatTokenAddress(chainId, token0.address),
              formatTokenAddress(chainId, token1.address),
            ],
            tvlUsd,
            apyBase,
            apyReward: campaignReward?.apyReward || 0,
            rewardTokens: campaignReward ? [...campaignReward.rewardTokens] : [],
            poolMeta: getPoolMeta(chainId, topPool),
            url: getPoolUrl(chainId, topPool),
          };
        })
        .filter(Boolean);
    })
    .flat()
    .filter((p) => p && utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ekubo.org/charts',
};
