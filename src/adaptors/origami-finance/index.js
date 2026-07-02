const sdk = require('@defillama/sdk');
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
 * @param {number} chainId
 * @returns {string}
 */
function getVaultApyUrl(chainId) {
  const input = encodeURIComponent(JSON.stringify({ chain: chainId }));
  return `${API_HOST}/public/external/vault-apy?input=${input}`;
}

/**
 * @param {string | number | bigint} x
 * @returns {bigint}
 */
const bi = (x) => BigInt(String(x));

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function leverageTvl(api, balances, vault) {
  const [reserveToken, al] = await Promise.all([
    api.call({ abi: 'address:reserveToken', target: vault }),
    api.call({
      abi: 'function assetsAndLiabilities() external view returns (uint256 assets, uint256 liabilities, uint256 ratio)',
      target: vault,
    }),
  ]);
  balances.addToken(reserveToken, bi(al.assets) - bi(al.liabilities));
}

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function repricingTvl(api, balances, vault) {
  const [decimals, supply, reserve, reserveToken] = await Promise.all([
    api.call({ abi: 'uint8:decimals', target: vault }),
    api.call({ abi: 'uint256:totalSupply', target: vault }),
    api.call({ abi: 'uint256:reservesPerShare', target: vault }),
    api.call({ abi: 'address:reserveToken', target: vault }),
  ]);
  const baseToken = await api.call({
    abi: 'address:baseToken',
    target: reserveToken,
  });
  const bal = (bi(reserve) * bi(supply)) / 10n ** bi(decimals);
  balances.addToken(baseToken, bal);
}

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function erc4626Tvl(api, balances, vault) {
  const [asset, totalAssets] = await Promise.all([
    api.call({ abi: 'address:asset', target: vault }),
    api.call({ abi: 'uint256:totalAssets', target: vault }),
  ]);
  balances.addToken(asset, String(totalAssets));
}

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function balanceSheetTvl(api, balances, vault) {
  const [tokens, sheet] = await Promise.all([
    api.call({
      abi: 'function tokens() external view returns (address[] assetTokens, address[] liabilityTokens)',
      target: vault,
    }),
    api.call({
      abi: 'function balanceSheet() external view returns (uint256[] totalAssets, uint256[] totalLiabilities)',
      target: vault,
    }),
  ]);
  tokens.assetTokens.forEach((token, j) =>
    balances.addToken(token, String(sheet.totalAssets[j]))
  );
  tokens.liabilityTokens.forEach((token, j) =>
    balances.subtractToken(token, String(sheet.totalLiabilities[j]))
  );
}

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function autoStakingTvl(api, balances, vault) {
  const [stakingToken, totalSupply] = await Promise.all([
    api.call({
      abi: 'function stakingToken() external view returns (address)',
      target: vault,
    }),
    api.call({ abi: 'uint256:totalSupply', target: vault }),
  ]);
  balances.addToken(stakingToken, String(totalSupply));
}

/**
 * @param {ChainApi} api
 * @param {Balances} balances
 * @param {VaultKind} kind
 * @param {string} vault
 * @returns {Promise<void>}
 */
async function vaultKindTvl(api, balances, kind, vault) {
  switch (kind) {
    case 'LEVERAGE':
      return leverageTvl(api, balances, vault);
    case 'REPRICING':
      return repricingTvl(api, balances, vault);
    case 'ERC4626':
      return erc4626Tvl(api, balances, vault);
    case 'BALANCE_SHEET':
      return balanceSheetTvl(api, balances, vault);
    case 'AUTO_STAKING':
      return autoStakingTvl(api, balances, vault);
    default:
      throw new Error(`Unsupported vault kind: ${kind}`);
  }
}

/**
 * @param {ChainApi} api
 * @param {string} chain
 * @param {VaultApy} vault
 * @returns {Promise<number>}
 */
async function vaultTvlUsd(api, chain, vault) {
  const balances = new sdk.Balances({ chain });
  for (const kind of vault.vault_kinds) {
    await vaultKindTvl(api, balances, kind, vault.address);
  }
  return Math.max(0, await balances.getUSDValue());
}

/**
 * @param {string} chain
 * @param {number} chainId
 * @returns {Promise<Pool[]>}
 */
async function chainPools(chain, chainId) {
  const api = new sdk.ChainApi({ chain });
  const { data } = await axios.get(getVaultApyUrl(chainId), {
    timeout: 10_000,
  });

  const results = await Promise.allSettled(
    data.vaults.map(async (vault) => ({
      pool: `${vault.address}-${chain}`,
      chain: chain,
      project: 'origami-finance',
      symbol: vault.symbol,
      tvlUsd: await vaultTvlUsd(api, chain, vault),
      apyBase: vault.apy,
      underlyingTokens: vault.underlying_tokens,
      url: `https://origami.finance/vaults/${chainId}-${getAddress(
        vault.address
      )}/info`,
    }))
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

const apy = async () => {
  const results = await Promise.allSettled(
    Object.entries(CHAINS).map(([chain, chainId]) => chainPools(chain, chainId))
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
};

module.exports = {
  protocolId: '4592',
  timetravel: false,
  apy,
};

/** @typedef {import('@defillama/sdk').ChainApi} ChainApi */
/** @typedef {import('@defillama/sdk').Balances} Balances */

/**
 * @typedef {'ERC4626' | 'REPRICING' | 'LEVERAGE' | 'BALANCE_SHEET' | 'AUTO_STAKING'} VaultKind
 */

/**
 * @typedef {Object} VaultApy
 * @property {string} address
 * @property {string} symbol
 * @property {VaultKind[]} vault_kinds
 * @property {string[]} underlying_tokens
 * @property {number} apy
 */

/**
 * @typedef {Object} Pool
 * @property {string} pool
 * @property {string} chain
 * @property {string} project
 * @property {string} symbol
 * @property {number} tvlUsd
 * @property {number} apyBase
 * @property {string[]} underlyingTokens
 * @property {string} url
 */
