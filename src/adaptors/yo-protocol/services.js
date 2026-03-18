const axios = require('axios');

exports.getVaultReward = async (url) => {
  // Paginate through all Merkl opportunities
  const allOpportunities = [];
  let page = 0;

  while (true) {
    const separator = url.includes('?') ? '&' : '?';
    const paginatedUrl = `${url}${separator}items=100${page > 0 ? `&page=${page}` : ''}`;
    const response = (await axios.get(paginatedUrl)).data;

    if (!response || !Array.isArray(response) || response.length === 0) break;

    allOpportunities.push(...response);
    if (response.length < 100) break;
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
