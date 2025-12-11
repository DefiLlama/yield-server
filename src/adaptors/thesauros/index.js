const sdk = require('@defillama/sdk');
const { formatChain, getERC4626Info, getPrices } = require('../utils');

// Thesauros vault configuration
const VAULTS = {
  base: {
    chainId: 8453,
    chainName: 'base',
    vaults: [
      {
        address: '0x6C7013b3596623d146781c90b4Ee182331Af6148',
        symbol: 'tUSDC',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        assetSymbol: 'USDC',
        name: 'Thesauros USDC Vault',
        decimals: 6,
      },
    ],
    providers: {
      aaveV3: '0x034a62f9617E8A1770f7c7EbA04e2DAb2Fda7f12',
      compoundV3: '0xFFAc48125fa4Bd8BC03CDCA725459563aAe77406',
    },
  },
  arbitrum: {
    chainId: 42161,
    chainName: 'arbitrum',
    vaults: [
      {
        address: '0x57C10bd3fdB2849384dDe954f63d37DfAD9d7d70',
        symbol: 'tUSDC',
        asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
        assetSymbol: 'USDC',
        name: 'Thesauros USDC Vault',
        decimals: 6,
      },
      {
        address: '0xcd72118C0707D315fa13350a63596dCd9B294A30',
        symbol: 'tUSDT',
        asset: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum
        assetSymbol: 'USDT',
        name: 'Thesauros USDT Vault',
        decimals: 6,
      },
    ],
    providers: {
      aaveV3: '0xbeEdb89DC47cab2678eBB796cfc8131062F16E39',
      compoundV3: '0xaBD932E0Fff6417a4Af16431d8D86a4e62d62fA3',
    },
  },
};

// ABI for Vault contract
const vaultAbi = [
  {
    inputs: [],
    name: 'activeProvider',
    outputs: [
      {
        internalType: 'contract IProvider',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'asset',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

// ABI for Provider contract
const providerAbi = [
  {
    inputs: [
      {
        internalType: 'contract IVault',
        name: 'vault',
        type: 'address',
      },
    ],
    name: 'getDepositRate',
    outputs: [
      {
        internalType: 'uint256',
        name: 'rate',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getIdentifier',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Get APY from provider
 * @param {string} providerAddress - Provider contract address
 * @param {string} vaultAddress - Vault contract address
 * @param {string} chain - Chain name
 * @returns {Promise<number>} APY in percentage (e.g., 5.5 for 5.5%)
 */
async function getProviderApy(providerAddress, vaultAddress, chain) {
  try {
    const rate = (
      await sdk.api.abi.call({
        target: providerAddress,
        abi: providerAbi.find((m) => m.name === 'getDepositRate'),
        params: [vaultAddress],
        chain,
      })
    ).output;

    // Rate is in ray units (1e27), convert to APY percentage
    // APY = (rate / 1e27) * 100
    const apy = (Number(rate) / 1e27) * 100;
    return apy;
  } catch (error) {
    console.error(
      `Error getting APY from provider ${providerAddress}:`,
      error.message
    );
    return 0;
  }
}

/**
 * Get active provider identifier
 * @param {string} vaultAddress - Vault contract address
 * @param {string} chain - Chain name
 * @returns {Promise<string>} Provider identifier
 */
async function getActiveProviderIdentifier(vaultAddress, chain) {
  try {
    const activeProviderAddress = (
      await sdk.api.abi.call({
        target: vaultAddress,
        abi: vaultAbi.find((m) => m.name === 'activeProvider'),
        chain,
      })
    ).output;

    // Try to get identifier from provider
    try {
      const identifier = (
        await sdk.api.abi.call({
          target: activeProviderAddress,
          abi: providerAbi.find((m) => m.name === 'getIdentifier'),
          chain,
        })
      ).output;
      return identifier || 'unknown';
    } catch {
      return 'unknown';
    }
  } catch (error) {
    console.error(
      `Error getting active provider for vault ${vaultAddress}:`,
      error.message
    );
    return 'unknown';
  }
}

/**
 * Main APY function
 * @returns {Promise<Array>} Array of pool objects
 */
async function apy() {
  const pools = [];

  for (const [chainKey, chainConfig] of Object.entries(VAULTS)) {
    const { chainName, vaults } = chainConfig;

    for (const vault of vaults) {
      try {
        // Get TVL using ERC4626 info
        // Use decimals from vault config (default to 6 for USDC/USDT)
        const decimals = vault.decimals || 6;
        const assetUnit = '1' + '0'.repeat(decimals);
        
        const erc4626Info = await getERC4626Info(
          vault.address.toLowerCase(),
          chainName,
          undefined,
          { assetUnit }
        );

        if (!erc4626Info || !erc4626Info.tvl) {
          console.warn(
            `No TVL data for vault ${vault.address} on ${chainName}`
          );
          continue;
        }

        // Get asset price
        const prices = await getPrices([vault.asset], chainName);

        const assetPrice =
          prices.pricesByAddress?.[vault.asset.toLowerCase()] || 1;

        // Calculate TVL in USD
        const tvlUsd = (erc4626Info.tvl / 10 ** decimals) * assetPrice;

        // Get active provider APY
        const activeProviderAddress = (
          await sdk.api.abi.call({
            target: vault.address,
            abi: vaultAbi.find((m) => m.name === 'activeProvider'),
            chain: chainName,
          })
        ).output;

        const apyBase = await getProviderApy(
          activeProviderAddress,
          vault.address,
          chainName
        );

        // Get provider identifier for pool metadata
        const providerIdentifier = await getActiveProviderIdentifier(
          vault.address,
          chainName
        );

        const pool = {
          pool: `${vault.address}-${chainName}`.toLowerCase(),
          chain: formatChain(chainName),
          project: 'thesauros',
          symbol: vault.symbol,
          tvlUsd: tvlUsd,
          apyBase: apyBase,
          underlyingTokens: [vault.asset],
          poolMeta: `Active Provider: ${providerIdentifier}`,
          url: `https://app.thesauros.io/vault/${vault.address}`,
        };

        pools.push(pool);
      } catch (error) {
        console.error(
          `Error processing vault ${vault.address} on ${chainName}:`,
          error.message
        );
        // Continue with other vaults even if one fails
        continue;
      }
    }
  }

  return pools.filter((p) => p && p.tvlUsd > 0);
}

module.exports = {
  timetravel: false,
  apy,
};
