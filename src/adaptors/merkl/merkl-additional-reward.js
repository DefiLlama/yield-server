const { networks, chainAliases } = require('./config');
const { getData } = require('../utils');

const getChainAliases = (canonical) =>
  chainAliases[canonical] || [canonical];

// Merkl exposes an `action` per opportunity: BORROW, LEND, POOL, HOLD, DROP.
// BORROW campaigns reward borrowers (→ apyRewardBorrow); everything else
// rewards holders/suppliers/LPs (→ apyReward).
const isBorrowAction = (pool) => pool.action === 'BORROW';

const mergeEntries = (a, b) => {
  const merged = {
    rewardTokens: [
      ...new Set([
        ...(a.rewardTokens || []),
        ...(b.rewardTokens || []),
      ]),
    ],
  };
  if (a.apyReward !== undefined || b.apyReward !== undefined) {
    merged.apyReward = (a.apyReward || 0) + (b.apyReward || 0);
  }
  if (a.apyRewardBorrow !== undefined || b.apyRewardBorrow !== undefined) {
    merged.apyRewardBorrow =
      (a.apyRewardBorrow || 0) + (b.apyRewardBorrow || 0);
  }
  return merged;
};

exports.addMerklRewardApy = async (
  pools,
  protocolId,
  poolAddressGetter,
) => {
  try {
    let merklPools = [];
    let pageI = 0;

    while (true) {
      let data;
      try {
        data = await getData(
          `https://api.merkl.xyz/v4/opportunities?mainProtocolId=${protocolId}&status=LIVE&items=100&page=${pageI}`
        );
      } catch (err) {
        console.log(`failed to fetch Merkl data for ${protocolId}: ${err}`);
        break;
      }

      if (data.length === 0) break;
      merklPools.push(...data);
      pageI++;
    }

    const merklPoolsMap = {};
    for (const canonical of Object.values(networks)) {
      for (const alias of getChainAliases(canonical)) {
        merklPoolsMap[alias] = {};
      }
    }

    merklPools.forEach(pool => {
      const canonical = networks[pool.chainId];
      if (!canonical) {
        return;
      }

      const isBorrow = isBorrowAction(pool);
      const rewardTokens = [
        ...new Set(
          pool.rewardsRecord?.breakdowns.map(x => x.token.address) || [],
        ),
      ];
      const entry = isBorrow
        ? { apyRewardBorrow: pool.apr, rewardTokens }
        : { apyReward: pool.apr, rewardTokens };
      const id = pool.identifier.toLowerCase();
      // Also index under each token address so adapters keying on a
      // receipt/wrapper token (e.g. an aToken or vault share) can match
      // an opportunity whose primary identifier is the underlying market.
      // Skipped for BORROW campaigns: their tokens[] may list debt or
      // collateral assets that don't represent the rewarded position.
      const tokenAddrs = isBorrow
        ? []
        : [...new Set(
            (pool.tokens || [])
              .map(t => t?.address?.toLowerCase())
              .filter(Boolean),
          )];
      for (const alias of getChainAliases(canonical)) {
        const existingId = merklPoolsMap[alias][id];
        merklPoolsMap[alias][id] = existingId
          ? mergeEntries(existingId, entry)
          : entry;
        for (const addr of tokenAddrs) {
          const existing = merklPoolsMap[alias][addr];
          if (!existing) {
            merklPoolsMap[alias][addr] = entry;
          } else if (existing !== entry) {
            // Multiple Merkl campaigns share this token address (e.g. a
            // supply + boost pair, or a supply + borrow campaign on the
            // same market). Combine APRs per side and union reward tokens
            // so no campaign silently wins the fallback match.
            merklPoolsMap[alias][addr] = mergeEntries(existing, entry);
          }
        }
      }
    });

    return pools.map(pool => {
      const poolAddress = poolAddressGetter ? poolAddressGetter(pool) : pool.pool;
      const merklRewards = merklPoolsMap[pool.chain.toLowerCase()]?.[poolAddress.toLowerCase()];

      if (!merklRewards) {
        return pool;
      }

      const updated = { ...pool };
      let changed = false;

      if (merklRewards.apyReward > 0 && !pool.apyReward) {
        updated.apyReward = merklRewards.apyReward;
        changed = true;
      }
      if (merklRewards.apyRewardBorrow > 0 && !pool.apyRewardBorrow) {
        updated.apyRewardBorrow = merklRewards.apyRewardBorrow;
        changed = true;
      }
      if (changed && merklRewards.rewardTokens?.length) {
        updated.rewardTokens = [
          ...new Set([
            ...(pool.rewardTokens || []),
            ...merklRewards.rewardTokens,
          ]),
        ];
      }

      if (
        !changed &&
        ((merklRewards.apyReward > 0 && pool.apyReward) ||
          (merklRewards.apyRewardBorrow > 0 && pool.apyRewardBorrow))
      ) {
        console.log(
          'pool already has matching apy reward field(s)',
          pool.pool,
        );
      }
      return changed ? updated : pool;
    });
  } catch (err) {
    console.log(`Failed to add Merkl reward apy to ${protocolId}: ${err}`);
    return pools;
  }
};
