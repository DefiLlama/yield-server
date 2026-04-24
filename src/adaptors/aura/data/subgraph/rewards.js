const axios = require('axios');
const { CHAIN_CONFIG } = require('../../config');

/**
 * Get pool rewards data from Aura subgraph
 */
async function getAuraPoolRewards(chainName) {
  const chainConfig = CHAIN_CONFIG[chainName];
  if (!chainConfig?.subgraph) return null;

  const query = `
    query Dynamics {
      pools(first: 1000, skip: 0) {
        id
        lpToken {
          id
        }
        rewardData {
          token {
            id
            decimals
          }
          rewardRate
          periodFinish
          queuedRewards
        }
      }
    }
  `;

  try {
    const response = await axios.post(chainConfig.subgraph, { query });
    return response.data.errors ? null : response.data.data;
  } catch {
    return null;
  }
}

module.exports = {
  getAuraPoolRewards,
};
