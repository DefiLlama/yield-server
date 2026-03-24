const axios = require('axios');

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
        typeof campaign.apr === 'number' &&
        campaign.apr > 0 &&
        campaign.Opportunity?.identifier &&
        campaign.Opportunity.identifier.trim() !== ''
    )
    .forEach((campaign) => {
      const key = campaign.Opportunity.identifier.toLowerCase();
      const existing = vaultRewardMap.get(key);
      if (!existing || campaign.apr > existing.apr) {
        vaultRewardMap.set(key, campaign);
      }
    });

  return vaultRewardMap;
};
