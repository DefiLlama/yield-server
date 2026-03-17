const axios = require('axios');

exports.getVaultReward = async (url) => {
  const response = (await axios.get(url)).data;

  if (!response || !Array.isArray(response)) {
    return new Map();
  }

  // Match by vault address only (not chain) so all chains share the reward APY.
  // When multiple campaigns exist for the same vault, keep the one with the highest APR.
  const vaultRewardMap = new Map();

  response
    .filter(
      (opportunity) =>
        opportunity.status === 'LIVE' &&
        typeof opportunity.apr === 'number' &&
        opportunity.type !== 'INVALID'
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
