const utils = require('../utils');

const API_URL = 'https://prod-api.ekubo.org';
const ETHEREUM_CHAIN_ID = '0x1';
const STARKNET_CHAIN_ID = '0x534e5f4d41494e';
const MIN_TVL_USD = 10000;

const CHAINS = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    apiChainId: BigInt(ETHEREUM_CHAIN_ID).toString(),
    chain: 'ethereum',
  },
  {
    chainId: STARKNET_CHAIN_ID,
    apiChainId: BigInt(STARKNET_CHAIN_ID).toString(),
    chain: 'starknet',
  },
];

function normalizeTokenRef(chainId, address) {
  return `${chainId}:${BigInt(address).toString()}`;
}

function getPairKey(chainId, tokenA, tokenB) {
  const [token0, token1] = [
    normalizeTokenRef(chainId, tokenA),
    normalizeTokenRef(chainId, tokenB),
  ].sort();

  return `${token0}:${token1}`;
}

function formatTokenAddress(chainId, address) {
  if (chainId === STARKNET_CHAIN_ID) {
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

async function getChainData({ apiChainId }) {
  const query = `chainId=${encodeURIComponent(apiChainId)}`;

  const [tokens, pairData, campaigns] = await Promise.all([
    utils.getData(`${API_URL}/tokens?${query}&pageSize=10000`),
    utils.getData(`${API_URL}/overview/pairs?${query}&minTvlUsd=${MIN_TVL_USD}`),
    utils.getData(`${API_URL}/campaigns?${query}`),
  ]);

  return {
    tokens,
    pairs: pairData.topPairs,
    campaigns: campaigns.campaigns,
  };
}

async function apy() {
  const results = await Promise.all(CHAINS.map(getChainData));
  const tokens = results.flatMap((result) => result.tokens);
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

      const tvlUsd =
        getAmountUsd(token0, p.tvl0_total) + getAmountUsd(token1, p.tvl1_total);

      if (tvlUsd < MIN_TVL_USD) return;

      const feesUsd =
        getAmountUsd(token0, p.fees0_24h) + getAmountUsd(token1, p.fees1_24h);

      const apyBase = (feesUsd * 100 * 365) / tvlUsd;
      const campaignReward =
        campaignRewards.get(getPairKey(chainId, p.token0, p.token1)) || null;

      return {
        pool: `ekubo-${chainId}-${token0.address}-${token1.address}`.toLowerCase(),
        chain: utils.formatChain(
          CHAINS.find((chain) => chain.chainId === chainId)?.chain ?? chainId
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
        url: 'https://app.ekubo.org/charts',
      };
    })
    .filter((p) => p && utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ekubo.org/charts',
};
