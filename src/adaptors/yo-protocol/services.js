const superagent = require('superagent');

exports.getVaultReward = async (url) => {
  const response = (await superagent.get(url)).body;

  // Check if data exists and is an array
  if (!response || !Array.isArray(response)) {
    return new Map();
  }

  // Filter only live opportunities with valid APR and create a Map
  const vaultRewardMap = new Map();

  response
    .filter(
      (opportunity) =>
        opportunity.status === 'LIVE' && typeof opportunity.apr === 'number'
    )
    .forEach((opportunity) => {
      vaultRewardMap.set(opportunity.identifier.toLowerCase(), opportunity);
    });

  return vaultRewardMap;
};
