const axios = require('axios');

const YOGOLD_ADDRESS = '0x586675a3a46b008d8408933cf42d8ff6c9cc61a1';

exports.getVaultReward = async (url) => {
  const response = (await axios.get(url)).data;

  // Check if data exists and is an array
  if (!response || !Array.isArray(response)) {
    return new Map();
  }

  // Filter only live opportunities with valid APR and create a Map
  const vaultRewardMap = new Map();

  response
    .filter(
      (opportunity) =>
        opportunity.status === 'LIVE' &&
        typeof opportunity.apr === 'number' &&
        opportunity.type !== 'INVALID' &&
        (opportunity.chainId !== 1 ||
          opportunity.identifier.toLowerCase() === YOGOLD_ADDRESS)
    )
    .forEach((opportunity) => {
      vaultRewardMap.set(opportunity.identifier.toLowerCase(), opportunity);
    });

  return vaultRewardMap;
};
