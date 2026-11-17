const axios = require('axios');

const BASE_URL = 'https://api.merkl.xyz';
const DEFAULT_TIMEOUT = 30000;

const getMerklHeaders = (extra = {}) => {
  const key = process.env.MERKL_API_KEY;
  return key ? { 'X-API-Key': key, ...extra } : { ...extra };
};

const buildUrl = (pathOrUrl) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const suffix = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${BASE_URL}${suffix}`;
};

const merklGet = async (pathOrUrl, options = {}) => {
  const { headers, timeout, ...rest } = options;
  const res = await axios.get(buildUrl(pathOrUrl), {
    timeout: timeout ?? DEFAULT_TIMEOUT,
    ...rest,
    headers: getMerklHeaders(headers),
  });
  return res.data;
};

// Aave "net APR" campaigns top the market rate up to a target APR instead of
// paying on top of it, and Merkl reports the *target* in `apr` rather than the
// incremental part it actually distributes. Subtract the market rate Merkl
// already counted (`nativeApr`) so it isn't double counted against apyBase.
const TARGET_APR_DISTRIBUTION_TYPES = new Set([
  'AAVE_NET_APR',
  'AAVE_V4_NET_APR',
]);

// Points and pre-TGE tokens aren't tradable, so those campaigns add no APR.
const NON_TOKEN_REWARD_TYPES = new Set(['POINT', 'PRETGE']);

const isNonTokenReward = (token) => NON_TOKEN_REWARD_TYPES.has(token?.type);

const campaignRewardTokens = (opportunity) => [
  ...(opportunity.rewardsRecord?.breakdowns || []).map((x) => [
    x.onChainCampaignId,
    x.token,
  ]),
  ...(opportunity.campaigns || []).map((x) => [x.campaignId, x.rewardToken]),
];

const getCampaignAprBreakdowns = (opportunity) => {
  const nonTokenCampaignIds = new Set(
    campaignRewardTokens(opportunity)
      .filter(([, token]) => isNonTokenReward(token))
      .map(([campaignId]) => campaignId)
  );
  return (opportunity.aprRecord?.breakdowns || [])
    .filter((x) => x.type === 'CAMPAIGN')
    .map((x) => ({
      campaignId: x.identifier,
      apr: nonTokenCampaignIds.has(x.identifier)
        ? 0
        : TARGET_APR_DISTRIBUTION_TYPES.has(x.distributionType)
        ? Math.max(0, x.value - (opportunity.nativeApr || 0))
        : x.value,
    }));
};

const getRewardApr = (opportunity) => {
  const breakdowns = getCampaignAprBreakdowns(opportunity);
  if (breakdowns.length) return breakdowns.reduce((acc, x) => acc + x.apr, 0);

  const rewards = campaignRewardTokens(opportunity);
  return rewards.length && rewards.every(([, token]) => isNonTokenReward(token))
    ? 0
    : opportunity.apr;
};

module.exports = {
  MERKL_BASE_URL: BASE_URL,
  getMerklHeaders,
  merklGet,
  getRewardApr,
  getCampaignAprBreakdowns,
  isNonTokenReward,
};
