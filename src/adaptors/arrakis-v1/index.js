const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { arrakisABI } = require('./abi');

// Arrakis V1 Factory contracts
const FACTORIES = {
  ethereum: '0xea1aff9dbffd1580f6b81a3ad3589e66652db7d9',
  polygon: '0x37265A834e95D11c36527451c7844eF346dC342a',
  optimism: '0x2845c6929d621e32B7596520C8a1E5a37e616F09',
};

const getApy = async () => {
  const allPools = [];

  let apyByVault = {};
  try {
    const arrakisResponse = await axios.get(
      'https://indexer.api.arrakis.finance/api/vault/all?version=V1&sortDirection=desc&sort=tvl'
    );

    if (arrakisResponse.data.success && arrakisResponse.data.vaults) {
      arrakisResponse.data.vaults.forEach((vault) => {
        const apyBase = vault.averageApr || 0;
        apyByVault[vault.id.toLowerCase()] = apyBase;
      });
    }
  } catch (error) {
    console.error('Error fetching Arrakis APY data:', error.message);
  }

  for (const [chain, factoryAddress] of Object.entries(FACTORIES)) {
    try {
      const deployersResult = await sdk.api.abi.call({
        target: factoryAddress,
        abi: arrakisABI.getDeployers,
        chain: chain,
      });

      if (!deployersResult.output || deployersResult.output.length === 0) {
        continue;
      }

      const deployers = deployersResult.output;

      // Get all vaults for each deployer
      const vaultAddresses = [];
      for (const deployer of deployers) {
        const vaultsResult = await sdk.api.abi.call({
          target: factoryAddress,
          abi: arrakisABI.getPools,
          params: [deployer],
          chain: chain,
        });

        if (vaultsResult.output && vaultsResult.output.length > 0) {
          vaultAddresses.push(...vaultsResult.output);
        }
      }

      if (vaultAddresses.length === 0) {
        continue;
      }

      // Get token0, token1, and underlying balances for all vaults
      const [token0Results, token1Results, balancesResults] = await Promise.all([
        sdk.api.abi.multiCall({
          abi: arrakisABI.token0,
          calls: vaultAddresses.map((vault) => ({ target: vault })),
          chain: chain,
        }),
        sdk.api.abi.multiCall({
          abi: arrakisABI.token1,
          calls: vaultAddresses.map((vault) => ({ target: vault })),
          chain: chain,
        }),
        sdk.api.abi.multiCall({
          abi: arrakisABI.getUnderlyingBalances,
          calls: vaultAddresses.map((vault) => ({ target: vault })),
          chain: chain,
        }),
      ]);

      // Get token metadata (symbol, decimals)
      const uniqueTokens = [
        ...new Set([
          ...token0Results.output.map((r) => r.output).filter((t) => t != null),
          ...token1Results.output.map((r) => r.output).filter((t) => t != null),
        ]),
      ];

      const [symbolResults, decimalsResults] = await Promise.all([
        sdk.api.abi.multiCall({
          abi: 'erc20:symbol',
          calls: uniqueTokens.map((token) => ({ target: token })),
          chain: chain,
        }),
        sdk.api.abi.multiCall({
          abi: 'erc20:decimals',
          calls: uniqueTokens.map((token) => ({ target: token })),
          chain: chain,
        }),
      ]);

      const tokenMetadata = {};
      uniqueTokens.forEach((token, i) => {
        tokenMetadata[token.toLowerCase()] = {
          symbol: symbolResults.output[i]?.output || 'UNKNOWN',
          decimals: decimalsResults.output[i]?.output || 18,
        };
      });

      const priceKeys = uniqueTokens.map((t) => `${chain}:${t.toLowerCase()}`);
      const prices = (
        await axios.get(
          `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
        )
      ).data.coins;

      for (let i = 0; i < vaultAddresses.length; i++) {
        const vault = vaultAddresses[i];
        const token0 = token0Results.output[i]?.output;
        const token1 = token1Results.output[i]?.output;
        const balances = balancesResults.output[i]?.output;

        if (!token0 || !token1 || !balances) continue;

        const token0Meta = tokenMetadata[token0.toLowerCase()];
        const token1Meta = tokenMetadata[token1.toLowerCase()];

        // balances is an array: [amount0Current, amount1Current]
        const amount0 = Number(balances[0]) / 10 ** token0Meta.decimals;
        const amount1 = Number(balances[1]) / 10 ** token1Meta.decimals;

        // Prices are keyed by lowercase token addresses
        const price0Key = `${chain}:${token0.toLowerCase()}`;
        const price1Key = `${chain}:${token1.toLowerCase()}`;
        const price0 = prices[price0Key]?.price || 0;
        const price1 = prices[price1Key]?.price || 0;

        const tvlUsd = amount0 * price0 + amount1 * price1;

        if (tvlUsd < 1000) continue;

        const apyBase = apyByVault[vault.toLowerCase()] || 0;

        allPools.push({
          pool: vault,
          chain: utils.formatChain(chain),
          project: 'arrakis-v1',
          symbol: `${token0Meta.symbol}-${token1Meta.symbol}`,
          tvlUsd: tvlUsd,
          apyBase: apyBase,
          underlyingTokens: [token0, token1],
        });
      }
    } catch (error) {
      console.error(`Error fetching ${chain} vaults:`, error.message);
    }
  }

  return allPools;
};

module.exports = {
  timetravel: false,
  url: 'https://palm.arrakis.finance/vaults',
  apy: getApy,
};
