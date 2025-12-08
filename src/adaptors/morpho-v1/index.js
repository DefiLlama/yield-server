const { request, gql } = require('graphql-request');

const GRAPH_URL = 'https://api.morpho.org/graphql';
const CHAINS = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  hyperliquid: 999,
  katana: 747474,
  arbitrum: 42161,
  unichain: 130,
  polygon: 137,
  monad: 143,
};

/**
 * IMPORTANT: This adapter handles the morpho-v1 related protocol which includes:
 * - Morpho Market V1 (formerly Morpho Blue markets) → borrow pools
 * - Morpho Vault V1 (formerly MetaMorpho vaults) → earn pools
 * - Morpho Vault V2 allocating into either Morpho Vault V1 or Morpho Market V1 → earn pools
 *
 * Morpho Vault V2 allocates through adapters to Vault V1 and Market V1 ONLY for now.
 *
 * For more details on field definitions, see: https://api.morpho.org/graphql
 */

const gqlQueries = {
  marketsData: gql`
    query GetYieldsData($chainId: Int!, $skip: Int!) {
      markets(
        first: 100
        skip: $skip
        orderBy: SupplyAssetsUsd
        orderDirection: Desc
        where: { chainId_in: [$chainId], whitelisted: true }
      ) {
        items {
          uniqueKey
          lltv
          loanAsset {
            address
            symbol
            priceUsd
            decimals
          }
          collateralAsset {
            address
            symbol
            priceUsd
            decimals
          }
          state {
            supplyApy
            borrowApy
            netSupplyApy
            netBorrowApy
            supplyAssets
            borrowAssets
            collateralAssets
            collateralAssetsUsd
            supplyAssetsUsd
            borrowAssetsUsd
            rewards {
              borrowApr
              asset {
                address
              }
            }
          }
        }
      }
    }
  `,
  metaMorphoVaults: gql`
    query GetVaultsData($chainId: Int!, $skip: Int!) {
      vaults(
        first: 100
        skip: $skip
        orderBy: TotalAssetsUsd
        orderDirection: Desc
        where: { chainId_in: [$chainId], whitelisted: true }
      ) {
        items {
          chain {
            id
          }
          address
          name
          symbol
          asset {
            address
          }
          state {
            totalAssets
            totalAssetsUsd
            apy
            netApy
            fee
            totalSupply
            allocation {
              supplyAssetsUsd
              market {
                uniqueKey
                state {
                  rewards {
                    asset {
                      address
                    }
                    supplyApr
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  vaultV2s: gql`
    query GetVaultV2Data($chainId: Int!, $skip: Int!) {
      vaultV2s(
        first: 100
        skip: $skip
        where: { chainId_in: [$chainId], whitelisted: true }
      ) {
        items {
          address
          symbol
          name
          asset {
            address
          }
          chain {
            id
          }
          totalAssetsUsd
          avgApy
          avgNetApy
          performanceFee
          managementFee
          maxRate
          rewards {
            asset {
              address
            }
            supplyApr
          }
          adapters {
            items {
              type
            }
          }
        }
      }
    }
  `,
};

const isNegligible = (part, total, threshold = 0.01) => {
  // "part is negligible relative to total" <=> |part| / |total| < threshold
  const denom = Math.abs(total);
  if (denom === 0) {
    // If total is 0, treat any non-zero part as non-negligible.
    return Math.abs(part) === 0;
  }
  return Math.abs(part) / denom < threshold;
};

// Allowed adapter types for Vault V2
// Vault V2 only allocates to Vault V1 (MetaMorpho) and Market V1
const ALLOWED_ADAPTER_TYPES = ['MetaMorpho', 'MorphoMarketV1'];

const buildVaultV2Pools = (earnV2, chain) =>
  earnV2
    // Filter vaults to only include those with allowed adapter types
    .filter((vault) => {
      // Check if vault has adapters
      if (!vault.adapters?.items || vault.adapters.items.length === 0) {
        return false;
      }
      // Check if all adapters are of allowed types
      return vault.adapters.items.every((adapter) =>
        ALLOWED_ADAPTER_TYPES.includes(adapter.type)
      );
    })
    .map((vault) => {
      // (a) Aggregate reward APRs from all positive supplyApr entries.
      //     This is the "rewards" side as exposed by the API.
      const totalRewardApr =
        vault.rewards?.reduce(
          (sum, reward) => sum + (reward.supplyApr > 0 ? reward.supplyApr : 0),
          0
        ) || 0;

      // (b) Decide whether to surface rewards separately.
      //     We call them negligible if they are < 1% of the total net APY.
      const rewardsAreNegligible = isNegligible(totalRewardApr, vault.avgNetApy);

      const rewardTokens = rewardsAreNegligible
        ? []
        : (vault.rewards || [])
            .filter((reward) => reward.supplyApr > 0)
            .map((reward) => reward.asset.address.toLowerCase());

      // (c) Split avgNetApy (after fees, with rewards) into base + rewards.
      //
      //     Definitions:
      //       - avgNetApy: realized average net APY of the vault
      //                    (after fees, including rewards).
      //       - totalRewardApr: sum of all reward APRs from rewards.supplyApr.
      //
      //     We want:
      //       totalAPY (what user earns) = apyBase + apyReward
      //                                 ≈ avgNetApy
      //
      //     So we define (in decimal form):
      //       rewardComponent = rewardsAreNegligible ? 0 : totalRewardApr
      //       baseComponent   = avgNetApy - rewardComponent
      //
      //     And convert both to percentages for DefiLlama:
      const rewardComponent = rewardsAreNegligible ? 0 : totalRewardApr;

      const apyReward = rewardComponent * 100;
      const apyBase = (vault.avgNetApy - rewardComponent) * 100;

      return {
        pool: `morpho-vault-v2-${vault.address}-${chain}`,
        chain,
        project: 'morpho-v1',
        symbol: vault.symbol,
        // Base APY: net yield from the strategy + underlying asset, after fees,
        //           excluding explicit reward APRs.
        apyBase,
        tvlUsd: vault.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.morpho.org/${chain}/vault/${vault.address}`,

        // Reward APY: sum of reward APRs from rewards.supplyApr,
        //             hidden when negligible vs avgNetApy.
        apyReward,
        rewardTokens,
      };
    });

const apy = async () => {
  let pools = [];

  for (const [chain, chainId] of Object.entries(CHAINS)) {
    // Fetch Vault V1 (MetaMorpho) data with pagination
    let allVaults = [];
    let skip = 0;
    while (true) {
      const { vaults } = await request(GRAPH_URL, gqlQueries.metaMorphoVaults, {
        chainId,
        skip,
      });

      if (!vaults.items.length) break;

      allVaults = [...allVaults, ...vaults.items];
      skip += 100;
    }

    // Fetch Vault V2 data with pagination
    let allVaultV2s = [];
    skip = 0;
    while (true) {
      const { vaultV2s } = await request(GRAPH_URL, gqlQueries.vaultV2s, {
        chainId,
        skip,
      });

      if (!vaultV2s.items.length) break;

      allVaultV2s = [...allVaultV2s, ...vaultV2s.items];
      skip += 100;
    }

    // Fetch markets data with pagination
    let allMarkets = [];
    skip = 0;
    while (true) {
      const { markets } = await request(GRAPH_URL, gqlQueries.marketsData, {
        chainId,
        skip,
      });

      if (!markets.items.length) break;

      allMarkets = [...allMarkets, ...markets.items];
      skip += 100;
    }

    const earnV1 = allVaults;
    const earnV2 = allVaultV2s;
    const borrow = allMarkets;

    // Transform Vault V1 (MetaMorpho) pools
    const earnV1Pools = earnV1.map((vault) => {
      // fetch reward token addresses from allocation data
      let additionalRewardTokens = new Set();
      vault.state.allocation.forEach((allocatedMarket) => {
        const allocationUsd = allocatedMarket.supplyAssetsUsd;
        if (allocationUsd > 0) {
          // For each reward from the allocated market
          allocatedMarket.market.state.rewards?.forEach((rw) => {
            if (rw.supplyApr > 0) {
              additionalRewardTokens.add(rw.asset.address.toLowerCase());
            }
          });
        }
      });

      // net = including rewards, apy = baseApy
      const rewardsApy = Math.max(vault.state.netApy - vault.state.apy, 0);
      const isNegligibleApy = isNegligible(rewardsApy, vault.state.netApy);
      let rewardTokens = isNegligibleApy ? [] : [...additionalRewardTokens];
      let apyReward = rewardTokens.length === 0 ? 0 : rewardsApy * 100;

      // override and add OP rewards to this pool
      if (
        vault.address.toLowerCase() ===
        '0xc30ce6a5758786e0f640cc5f881dd96e9a1c5c59'
      ) {
        rewardTokens = ['0x4200000000000000000000000000000000000042'];
        apyReward = rewardsApy * 100;
      }

      return {
        pool: `morpho-vault-v1-${vault.address}-${chain}`,
        chain,
        project: 'morpho-v1',
        symbol: vault.symbol,
        apyBase: vault.state.apy * 100,
        tvlUsd: vault.state.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.morpho.org/${chain}/vault/${vault.address}`,
        apyReward,
        rewardTokens,
      };
    });

    // Transform Vault V2 pools
    // Note: avgNetApy is the realized average net APY (after fees, with rewards)
    // rewards.supplyApr contains the reward APRs from the API
    // as per the GraphQL schema definition, see: https://api.morpho.org/graphql
    // The API already applies maxRate capping when calculating these from share price evolution
    // We filter to only include vaults with MetaMorpho or MorphoMarketV1 adapters
    const earnV2Pools = buildVaultV2Pools(earnV2, chain);

    const borrowPools = borrow.map((market) => {
      if (!market.collateralAsset?.symbol) return null;
      const rewardTokens = market.state.rewards
        .filter((reward) => reward.borrowApr > 0)
        .map((reward) => reward.asset.address);

      const apyRewardBorrow =
        Math.max(
          0,
          (market.state.borrowApy || 0) - (market.state.netBorrowApy || 0)
        ) * 100;

      return {
        pool: `morpho-blue-${market.uniqueKey}-${chain}`,
        chain,
        project: 'morpho-v1',
        symbol: market.collateralAsset?.symbol,
        apy: 0,
        tvlUsd: market.state.collateralAssetsUsd || 0,
        underlyingTokens: [market.collateralAsset.address],
        apyBaseBorrow: market.state.borrowApy * 100,
        totalSupplyUsd: market.state.collateralAssetsUsd ?? 0,
        totalBorrowUsd: market.state.borrowAssetsUsd ?? 0,
        debtCeilingUsd:
          market.state.supplyAssetsUsd - market.state.borrowAssetsUsd,
        ltv: market.lltv / 1e18,
        mintedCoin: market.loanAsset?.symbol,
        url: `https://app.morpho.org/market?id=${market.uniqueKey}&network=${chain}`,
        apyRewardBorrow,
        rewardTokens: apyRewardBorrow > 0 ? rewardTokens : [],
      };
    });

    pools = [...pools, ...earnV1Pools, ...earnV2Pools, ...borrowPools];
  }

  const uniquePools = Array.from(
    pools
      .reduce((map, pool) => {
        if (!pool) return map;
        const key = pool.pool; // pool.pool already contains the full unique ID
        if (!map.has(key) || pool.tvlUsd > map.get(key).tvlUsd) {
          map.set(key, pool);
        }
        return map;
      }, new Map())
      .values()
  );

  return uniquePools.filter(Boolean);
};

module.exports = {
  apy,
};
