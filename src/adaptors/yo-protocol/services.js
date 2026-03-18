const axios = require('axios');

exports.getVaultReward = async (url) => {
  // Paginate through all Merkl opportunities
  const PAGE_SIZE = 100;
  const MAX_PAGES = 200;
  const allOpportunities = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const separator = url.includes('?') ? '&' : '?';
    const paginatedUrl = `${url}${separator}items=${PAGE_SIZE}${page > 0 ? `&page=${page}` : ''}`;
    const response = (await axios.get(paginatedUrl, { timeout: 10_000 })).data;

    if (!response || !Array.isArray(response) || response.length === 0) break;

    allOpportunities.push(...response);
    if (response.length < PAGE_SIZE) break;
    page++;
  }

  // Match by vault address only (not chain) so all chains share the reward APY.
  // When multiple campaigns exist for the same vault, keep the one with the highest APR.
  const vaultRewardMap = new Map();

  allOpportunities
    .filter(
      (opportunity) =>
        opportunity.status === 'LIVE' &&
        typeof opportunity.apr === 'number' &&
        opportunity.type !== 'INVALID' &&
        typeof opportunity.identifier === 'string' &&
        opportunity.identifier.trim() !== ''
    )
    .forEach((opportunity) => {
      const key = opportunity.identifier.toLowerCase();
      const existing = vaultRewardMap.get(key);
      if (!existing || opportunity.apr > existing.apr) {
        vaultRewardMap.set(key, opportunity);
      }
    });

  return vaultRewardMap;
};
