const axios = require('axios');
const {
  utils: { getAddress },
} = require('ethers');

const API_HOST = 'https://origami-api.automation-templedao.link';

const CHAINS = {
  ethereum: 1,
  berachain: 80094,
  plasma: 9745,
};

/**
 * Build the vault-apy request URL for a chain. The endpoint takes a single
 * url-encoded JSON `input`; omitting `vault` returns every vault on the chain.
 * @param {number} chainId
 * @returns {string}
 */
function getVaultApyUrl(chainId) {
  const input = encodeURIComponent(JSON.stringify({ chain: chainId }));
  return `${API_HOST}/public/external/vault-apy?input=${input}`;
}

/**
 * Map one endpoint vault into the DefiLlama yield-server pool shape.
 * @param {string} chain
 * @param {number} chainId
 * @param {VaultApy} vault
 * @returns {Pool}
 */
function vaultApy(chain, chainId, vault) {
  return {
    pool: `${vault.address}-${chain}`,
    chain: chain,
    project: 'origami-finance',
    symbol: vault.symbol,
    tvlUsd: Math.max(0, vault.total_tvl_usd),
    apyBase: vault.apy,
    underlyingTokens: vault.underlying_tokens,
    url: `https://origami.finance/vaults/${chainId}-${getAddress(
      vault.address
    )}/info`,
  };
}

/**
 * Fetch and map every vault on a single chain.
 * @param {string} chain
 * @param {number} chainId
 * @returns {Promise<Pool[]>}
 */
async function chainApy(chain, chainId) {
  /** @type {{ data: VaultApyResponse }} */
  const { data } = await axios.get(getVaultApyUrl(chainId));
  return data.vaults.map((vault) => vaultApy(chain, chainId, vault));
}

const apy = async () => {
  const results = await Promise.all(
    Object.entries(CHAINS).map(([chain, chainId]) => chainApy(chain, chainId))
  );

  return results.flat();
};

module.exports = {
  timetravel: false,
  apy,
};

/**
 * @typedef {Object} VaultApy
 * @property {string} address - Vault contract address (lowercased).
 * @property {string} symbol - Vault token symbol.
 * @property {number} total_tvl_usd - Vault TVL in USD.
 * @property {string[]} underlying_tokens - Underlying token addresses.
 * @property {number} apy - Net APY in percent (already compounded server-side).
 */

/**
 * @typedef {Object} VaultApyResponse
 * @property {VaultApy[]} vaults
 */

/**
 * @typedef {Object} Pool
 * @property {string} pool - Stable unique id: `<vaultAddress>-<chain>`.
 * @property {string} chain
 * @property {string} project - Always `origami-finance`.
 * @property {string} symbol
 * @property {number} tvlUsd
 * @property {number} apyBase
 * @property {string[]} underlyingTokens
 * @property {string} url
 */
