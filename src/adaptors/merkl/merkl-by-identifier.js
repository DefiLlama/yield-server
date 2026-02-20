const superagent = require('superagent');

// Chain ID mapping for Merkl API
const CHAIN_IDS = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  sonic: 146,
  hyperliquid: 999,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  avax: 43114,
  bsc: 56,
  gnosis: 100,
  fantom: 250,
  linea: 59144,
  scroll: 534352,
  zksync: 324,
  blast: 81457,
  mode: 34443,
  mantle: 5000,
  fraxtal: 252,
  manta: 169,
  sei: 1329,
  monad: 143,
};

/**
 * Fetch Merkl rewards for a specific vault/identifier address.
 * Use this for protocols that don't have a mainProtocolId registered with Merkl.
 *
 * @param {string} identifier - Vault or contract address to query
 * @param {string} chain - Chain name (e.g., 'ethereum', 'base')
 * @param {string} [defaultRewardToken] - Default reward token if none found in response
 * @returns {Promise<{apyReward: number, rewardTokens: string[]}|null>}
 */
const getMerklRewardsByIdentifier = async (
  identifier,
  chain,
  defaultRewardToken = null
) => {
  const chainId = CHAIN_IDS[chain.toLowerCase()];
  if (!chainId) return null;

  try {
    const response = await superagent.get(
      `https://api.merkl.xyz/v4/opportunities?chainId=${chainId}&identifier=${identifier}`
    );
    const data = response.body;
    if (!data || data.length === 0) return null;

    const opportunity = data[0];
    if (!opportunity.apr || opportunity.apr <= 0) return null;

    const rewardTokens =
      opportunity.rewardsRecord?.breakdowns
        ?.map((b) => b.token?.address)
        .filter(Boolean) || [];

    // Use default reward token if none found
    if (rewardTokens.length === 0 && defaultRewardToken) {
      rewardTokens.push(defaultRewardToken);
    }

    return {
      apyReward: opportunity.apr, // Merkl returns APR as percentage
      rewardTokens: [...new Set(rewardTokens)],
    };
  } catch (e) {
    // Silently fail - Merkl rewards are optional
    return null;
  }
};

/**
 * Batch fetch Merkl rewards for multiple identifiers on a single chain.
 * Processes in parallel batches to respect rate limits.
 *
 * @param {string[]} identifiers - Array of vault/contract addresses
 * @param {string} chain - Chain name
 * @param {Object} [options] - Options
 * @param {string} [options.defaultRewardToken] - Default reward token if none found
 * @param {number} [options.batchSize=5] - Concurrent requests per batch
 * @returns {Promise<Object.<string, {apyReward: number, rewardTokens: string[]}>>}
 */
const getMerklRewardsForChain = async (identifiers, chain, options = {}) => {
  const { defaultRewardToken = null, batchSize = 5 } = options;

  const chainId = CHAIN_IDS[chain.toLowerCase()];
  if (!chainId) return {};

  const rewards = {};

  for (let i = 0; i < identifiers.length; i += batchSize) {
    const batch = identifiers.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((id) => getMerklRewardsByIdentifier(id, chain, defaultRewardToken))
    );
    batch.forEach((id, idx) => {
      if (results[idx]) {
        rewards[id.toLowerCase()] = results[idx];
      }
    });
  }

  return rewards;
};

/**
 * Get chain ID for a given chain name.
 * @param {string} chain - Chain name
 * @returns {number|null}
 */
const getChainId = (chain) => CHAIN_IDS[chain.toLowerCase()] || null;

module.exports = {
  getMerklRewardsByIdentifier,
  getMerklRewardsForChain,
  getChainId,
  CHAIN_IDS,
};
