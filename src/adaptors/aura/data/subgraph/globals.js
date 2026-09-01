const axios = require('axios');
const { CHAIN_CONFIG } = require('../../config');

let globalsCache = null;

/**
 * Get Aura globals data from mainnet subgraph
 */
async function getAuraGlobals() {
  if (globalsCache) return globalsCache;

  const query = `
    query {
      global(id: "global") {
        auraTotalSupply
        auraMaxSupply
        auraReductionPerCliff
        auraTotalCliffs
      }
    }
  `;

  try {
    const response = await axios.post(CHAIN_CONFIG.ethereum.subgraph, {
      query,
    });
    if (response.data.errors) return null;

    globalsCache = response.data.data.global;
    return globalsCache;
  } catch {
    return null;
  }
}

module.exports = {
  getAuraGlobals,
};
