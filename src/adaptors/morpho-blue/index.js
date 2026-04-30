const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const { getMerklRewardsForChain } = require('../merkl/merkl-by-identifier');

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

// Maps chain keys to URL slugs used by app.morpho.org
// Only entries that differ from the chain key need to be listed
const CHAIN_URL_SLUG = {
  hyperliquid: 'hyperevm',
};

const getChainSlug = (chain) => CHAIN_URL_SLUG[chain] || chain;

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
        where: { chainId_in: [$chainId], totalAssetsUsd_gte: 10000 }
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
            decimals
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
        where: { chainId_in: [$chainId], totalAssetsUsd_gte: 10000 }
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

// Look up on-chain expiry for PT collateral tokens to filter expired ones.
// Tries both expiry() (Pendle) and maturity() (other protocols).
// Returns a Set of lowercase collateral addresses that are expired.
const EXPIRY_ABI = {
  inputs: [],
  name: 'expiry',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const MATURITY_ABI = { ...EXPIRY_ABI, name: 'maturity' };

const getExpiredPTAddresses = async (ptMarkets, chain) => {
  if (ptMarkets.length === 0) return new Set();

  const nowSec = Math.floor(Date.now() / 1000);
  const expired = new Set();
  const calls = ptMarkets.map((m) => ({
    target: m.collateralAsset.address,
  }));

  // Try expiry() first, then maturity() for tokens that failed
  for (const abi of [EXPIRY_ABI, MATURITY_ABI]) {
    const remaining = calls.filter(
      (c) => !expired.has(c.target.toLowerCase())
    );
    if (remaining.length === 0) break;

    try {
      const { output } = await sdk.api.abi.multiCall({
        chain,
        abi,
        calls: remaining,
        permitFailure: true,
      });

      for (const result of output) {
        if (result.success && result.output) {
          const ts = Number(result.output);
          if (ts > 0 && ts < nowSec) {
            expired.add(result.input.target.toLowerCase());
          }
        }
      }
    } catch {
      // If multicall fails entirely, continue to next ABI
    }
  }

  return expired;
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
        project: 'morpho-blue',
        symbol: vault.symbol,
        // Base APY: net yield from the strategy + underlying asset, after fees,
        //           excluding explicit reward APRs.
        apyBase,
        tvlUsd: vault.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.morpho.org/${getChainSlug(chain)}/vault/${vault.address}`,

        // Reward APY: sum of reward APRs from rewards.supplyApr,
        //             hidden when negligible vs avgNetApy.
        apyReward,
        rewardTokens,
      };
    });

const fetchChainData = async (chainId) => {
  const fetchPage = async (query, variables, key) => {
    try {
      return await request(GRAPH_URL, query, variables);
    } catch (error) {
      // GraphQL may return partial data alongside errors — surface it only
      // when the expected key is present; otherwise fail so the chain is skipped.
      if (error.response?.data?.[key]) return error.response.data;
      throw error;
    }
  };

  const fetchAll = async (query, key) => {
    const all = [];
    let skip = 0;
    while (true) {
      let response;
      try {
        response = await fetchPage(query, { chainId, skip }, key);
      } catch (error) {
        // Mid-pagination failures (e.g. upstream 504 on a later page) shouldn't
        // discard pages we've already gathered — keep what we have and log.
        if (all.length > 0) {
          console.error(
            `morpho-v1: ${key} pagination failed for chainId ${chainId} at skip=${skip} after ${all.length} items: ${error.message}`
          );
          return all;
        }
        throw error;
      }
      const page = response[key];
      if (!page?.items?.length) break;
      all.push(...page.items);
      skip += 100;
    }
    return all;
  };

  // Run the three dataset queries independently so a single failure doesn't
  // discard the successful ones for this chain.
  const datasets = ['vaults', 'vaultV2s', 'markets'];
  const results = await Promise.allSettled([
    fetchAll(gqlQueries.metaMorphoVaults, 'vaults'),
    fetchAll(gqlQueries.vaultV2s, 'vaultV2s'),
    fetchAll(gqlQueries.marketsData, 'markets'),
  ]);

  const [vaults, vaultV2s, markets] = results.map((r, i) => {
    if (r.status === 'rejected') {
      console.error(
        `morpho-v1: ${datasets[i]} query failed for chainId ${chainId}: ${r.reason?.message}`
      );
      return [];
    }
    return r.value;
  });

  return {
    earnV1: vaults.filter((v) => v.state !== null),
    earnV2: vaultV2s,
    borrow: markets,
  };
};

const apy = async () => {
  let pools = [];

  for (const [chain, chainId] of Object.entries(CHAINS)) {
    let chainData;
    try {
      chainData = await fetchChainData(chainId);
    } catch (error) {
      console.error(
        `morpho-v1: skipping ${chain} (chainId ${chainId}): ${error.message}`
      );
      continue;
    }
    const { earnV1, earnV2, borrow } = chainData;

    // Look up on-chain expiry for PT collateral tokens
    const ptMarkets = borrow.filter(
      (m) => m.collateralAsset?.symbol?.startsWith('PT-')
    );
    const expiredPTAddresses = await getExpiredPTAddresses(ptMarkets, chain);

    // Transform Vault V1 (MetaMorpho) pools
    const earnV1Pools = earnV1.map((vault) => {
      // fetch reward token addresses from allocation data
      let additionalRewardTokens = new Set();
      vault.state.allocation.forEach((allocatedMarket) => {
        const allocationUsd = allocatedMarket.supplyAssetsUsd;
        if (allocationUsd > 0) {
          // For each reward from the allocated market
          allocatedMarket.market.state?.rewards?.forEach((rw) => {
            if (rw.supplyApr > 0) {
              additionalRewardTokens.add(rw.asset.address.toLowerCase());
            }
          });
        }
      });

      // Vault V1 semantics are mixed:
      // - `apy` is the base APY before fees.
      // - `netApy` is the total user APY, but on fee-only vaults it may just
      //   be the fee-reduced base APY.
      // If we can see rewards here (allocation rewards or the OP override),
      // use fee-adjusted `apy` as base and the rest of `netApy` as rewards.
      // Otherwise treat it as fee-only and clamp base to the lower of
      // `apy` and `netApy`. Merkl can still add rewards later.
      const hasKnownRewardApy =
        additionalRewardTokens.size > 0 ||
        vault.address.toLowerCase() ===
          '0xc30ce6a5758786e0f640cc5f881dd96e9a1c5c59';
      const feeAdjustedBaseApy =
        vault.state.apy * (1 - Number(vault.state.fee || 0));
      const baseApy = hasKnownRewardApy
        ? Math.min(feeAdjustedBaseApy, vault.state.netApy)
        : Math.min(vault.state.apy, vault.state.netApy);

      // `netApy` is the total user APY. Once base is chosen using the mode
      // above, the remainder is the reward component we surface separately.
      const rewardsApy = hasKnownRewardApy
        ? Math.max(vault.state.netApy - baseApy, 0)
        : Math.max(vault.state.netApy - vault.state.apy, 0);
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

      // MetaMorpho shares are always 18-dec; assets aren't. Match Morpho UI.
      const assetDecimals = Number(vault.asset.decimals);
      const totalAssetsRaw = Number(vault.state.totalAssets);
      const totalSupplyRaw = Number(vault.state.totalSupply);
      const pricePerShare =
        Number.isFinite(totalAssetsRaw) &&
        Number.isFinite(totalSupplyRaw) &&
        Number.isFinite(assetDecimals) &&
        totalSupplyRaw > 0
          ? (totalAssetsRaw / totalSupplyRaw) * 10 ** (18 - assetDecimals)
          : null;

      return {
        pool: `morpho-vault-v1-${vault.address}-${chain}`,
        chain,
        project: 'morpho-blue',
        symbol: vault.symbol,
        apyBase: baseApy * 100,
        tvlUsd: vault.state.totalAssetsUsd || 0,
        pricePerShare,
        underlyingTokens: [vault.asset.address],
        url: `https://app.morpho.org/${getChainSlug(chain)}/vault/${vault.address}`,
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
      if (!market.collateralAsset?.symbol || !market.state) return null;
      // Skip expired PT collateral markets
      if (
        expiredPTAddresses.has(market.collateralAsset.address.toLowerCase())
      ) {
        return null;
      }
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
        project: 'morpho-blue',
        symbol: market.collateralAsset?.symbol,
        token: null,
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
        url: `https://app.morpho.org/${getChainSlug(chain)}/market/${market.uniqueKey}`,
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

  const filteredPools = uniquePools.filter(Boolean);

  // Phase 1: fetch merkl rewards by mainProtocolId=morpho (catches tagged vaults)
  const poolsAfterProtocol = await addMerklRewardApy(
    filteredPools,
    'morpho',
    (p) => {
      const match = p.pool.match(/0x[a-fA-F0-9]{40,}/);
      return match ? match[0] : p.pool;
    }
  );

  // Phase 2: for vault pools that didn't get merkl rewards, try by-identifier
  // Many MetaMorpho vaults have merkl campaigns but aren't tagged with protocol.id=morpho
  const vaultPrefixes = ['morpho-vault-v1-', 'morpho-vault-v2-'];
  const unrewarded = poolsAfterProtocol.filter(
    (p) =>
      vaultPrefixes.some((pfx) => p.pool.startsWith(pfx)) &&
      !p.apyReward &&
      (!p.rewardTokens || p.rewardTokens.length === 0)
  );

  if (unrewarded.length > 0) {
    // Group by chain and batch-query merkl
    const byChain = {};
    for (const p of unrewarded) {
      const chain = p.chain.toLowerCase();
      if (!byChain[chain]) byChain[chain] = [];
      const match = p.pool.match(/0x[a-fA-F0-9]{40}/);
      if (match) byChain[chain].push({ pool: p, addr: match[0] });
    }

    for (const [chain, entries] of Object.entries(byChain)) {
      const addrs = entries.map((e) => e.addr);
      const rewards = await getMerklRewardsForChain(addrs, chain, {
        batchSize: 10,
      });

      for (const entry of entries) {
        const reward = rewards[entry.addr.toLowerCase()];
        if (reward && reward.apyReward > 0) {
          entry.pool.apyReward = reward.apyReward;
          entry.pool.rewardTokens = reward.rewardTokens;
        }
      }
    }
  }

  return poolsAfterProtocol;
};

module.exports = {
  apy,
};
