const axios = require('axios');

/**
 * Gets the APR for a campaign with fallbacks.
 * Priority: campaign.apr > Opportunity.apr > params.distributionSettings.apr
 * Mirrors the backend's getCampaignApr logic so rewards survive Merkl recomputation windows.
 */
const getCampaignApr = (campaign) => {
  if (typeof campaign.apr === 'number' && campaign.apr > 0) {
    return campaign.apr;
  }

  if (campaign.Opportunity?.apr > 0) {
    return campaign.Opportunity.apr;
  }

  const paramsApr =
    campaign.params?.distributionMethodParameters?.distributionSettings?.apr;
  if (paramsApr) {
    const parsed = Number(paramsApr);
    if (parsed > 0) return parsed < 1 ? parsed * 100 : parsed;
  }

  return 0;
};

exports.getVaultReward = async (url) => {
  // Paginate through all Merkl campaigns
  const PAGE_SIZE = 100;
  const MAX_PAGES = 200;
  const allCampaigns = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const separator = url.includes('?') ? '&' : '?';
    const paginatedUrl = `${url}${separator}items=${PAGE_SIZE}${page > 0 ? `&page=${page}` : ''}`;
    const response = (await axios.get(paginatedUrl, { timeout: 10_000 })).data;

    if (!response || !Array.isArray(response) || response.length === 0) break;

    allCampaigns.push(...response);
    if (response.length < PAGE_SIZE) break;
    page++;
  }

  // Match by vault address (via Opportunity.identifier).
  // When multiple campaigns exist for the same vault, keep the one with the highest APR.
  const vaultRewardMap = new Map();

  allCampaigns
    .filter(
      (campaign) =>
        getCampaignApr(campaign) > 0 &&
        campaign.Opportunity?.identifier &&
        campaign.Opportunity.identifier.trim() !== ''
    )
    .forEach((campaign) => {
      const key = campaign.Opportunity.identifier.toLowerCase();
      const apr = getCampaignApr(campaign);
      const existing = vaultRewardMap.get(key);
      const existingApr = existing ? getCampaignApr(existing) : 0;
      if (apr > existingApr) {
        vaultRewardMap.set(key, { ...campaign, apr });
      }
    });

  return vaultRewardMap;
};
