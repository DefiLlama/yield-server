const { networks, chainAliases } = require('./config');
const { merklGet, getCampaignAprBreakdowns } = require('./merkl-client');

const getChainAliases = (canonical) => chainAliases[canonical] || [canonical];

// Merkl exposes an `action` per opportunity: BORROW, LEND, POOL, HOLD, DROP.
// BORROW campaigns reward borrowers (→ apyRewardBorrow); everything else
// rewards holders/suppliers/LPs (→ apyReward).
const isBorrowAction = (opportunity) => opportunity.action === 'BORROW';

// Merkl spawns a sub-campaign for every forwarder it recognises (Curve gauges,
// Pendle SY/LP/YT, vault wrappers) and lists each one as its own opportunity
// with its own APR. A sub-campaign re-reports a slice of its parent's budget,
// so a pool must not count a campaign together with one of its ancestors.
// Sibling sub-campaigns are distinct slices and do add up.
const ancestorsOf = (campaign, campaignsById) => {
  const ancestors = new Set();
  let parentId = campaign.parentCampaignId;
  while (parentId != null && !ancestors.has(String(parentId))) {
    ancestors.add(String(parentId));
    parentId = campaignsById[String(parentId)]?.parentCampaignId;
  }
  return ancestors;
};

const toContributions = (opportunity, campaignsById) => {
  const byCampaignId = Object.fromEntries(
    (opportunity.campaigns || []).map((c) => [String(c.campaignId), c])
  );
  const breakdowns = getCampaignAprBreakdowns(opportunity);
  if (!breakdowns.length) {
    return opportunity.apr > 0
      ? [
          {
            id: `opportunity:${opportunity.id}`,
            ancestors: new Set(),
            apr: opportunity.apr,
          },
        ]
      : [];
  }
  return breakdowns.map(({ campaignId, apr }) => {
    const campaign = byCampaignId[String(campaignId)];
    return {
      id: campaign ? String(campaign.id) : `campaign:${campaignId}`,
      ancestors: campaign ? ancestorsOf(campaign, campaignsById) : new Set(),
      apr,
    };
  });
};

const toCandidate = (opportunity, campaignsById) => ({
  isBorrow: isBorrowAction(opportunity),
  rewardTokens: [
    ...new Set(
      opportunity.rewardsRecord?.breakdowns.map((x) => x.token.address) || []
    ),
  ],
  contributions: toContributions(opportunity, campaignsById),
});

// Token-address matching exists for adapters keyed on a receipt token (an
// aToken, a vault share) whose Merkl identifier is a market hash. POOL
// campaigns list their LP's constituent tokens instead, which a constituent
// holder does not earn, so those only ever match by identifier.
const positionTokens = (opportunity, candidate) => {
  if (candidate.isBorrow || opportunity.action === 'POOL') return [];
  const id = opportunity.identifier.toLowerCase();
  return [
    ...new Set(
      (opportunity.tokens || [])
        .map((t) => t?.address?.toLowerCase())
        .filter((addr) => addr && addr !== id)
    ),
  ];
};

// Each campaign counts once per pool. A campaign is skipped when one of its
// ancestors is already counted, and it evicts any already-counted descendant.
const resolveRewards = (candidates) => {
  const chosen = new Map();
  for (const candidate of candidates) {
    for (const contribution of candidate.contributions) {
      if (chosen.has(contribution.id)) continue;
      if ([...contribution.ancestors].some((id) => chosen.has(id))) continue;
      for (const [id, existing] of chosen) {
        if (existing.ancestors.has(contribution.id)) chosen.delete(id);
      }
      chosen.set(contribution.id, { ...contribution, candidate });
    }
  }
  const entry = { rewardTokens: [] };
  for (const { apr, candidate } of chosen.values()) {
    const field = candidate.isBorrow ? 'apyRewardBorrow' : 'apyReward';
    entry[field] = (entry[field] || 0) + apr;
    entry.rewardTokens.push(...candidate.rewardTokens);
  }
  entry.rewardTokens = [...new Set(entry.rewardTokens)];
  return entry;
};

const fetchLiveOpportunities = async (protocolId) => {
  const opportunities = [];
  for (let page = 0; ; page++) {
    const data = await merklGet('/v4/opportunities', {
      params: {
        mainProtocolId: protocolId,
        status: 'LIVE',
        campaigns: true,
        items: 100,
        page,
      },
    });
    if (!data.length) break;
    opportunities.push(...data);
  }
  return opportunities;
};

exports.addMerklRewardApy = async (pools, protocolId, poolAddressGetter) => {
  try {
    let opportunities;
    try {
      opportunities = await fetchLiveOpportunities(protocolId);
    } catch (err) {
      console.log(`failed to fetch Merkl data for ${protocolId}: ${err}`);
      return pools;
    }

    const byIdentifier = {};
    const byPositionToken = {};
    for (const canonical of Object.values(networks)) {
      for (const alias of getChainAliases(canonical)) {
        byIdentifier[alias] = {};
        byPositionToken[alias] = {};
      }
    }

    const campaignsById = Object.fromEntries(
      opportunities.flatMap((o) =>
        (o.campaigns || []).map((c) => [String(c.id), c])
      )
    );

    for (const opportunity of opportunities) {
      const canonical = networks[opportunity.chainId];
      if (!canonical) continue;

      const candidate = toCandidate(opportunity, campaignsById);
      const id = opportunity.identifier.toLowerCase();
      const tokens = positionTokens(opportunity, candidate);
      for (const alias of getChainAliases(canonical)) {
        (byIdentifier[alias][id] ||= []).push(candidate);
        for (const addr of tokens) {
          (byPositionToken[alias][addr] ||= []).push(candidate);
        }
      }
    }

    return pools.map((pool) => {
      const poolAddress = (
        poolAddressGetter ? poolAddressGetter(pool) : pool.pool
      ).toLowerCase();
      const chain = pool.chain.toLowerCase();
      // An identifier match is positive evidence the pool is the rewarded
      // position; a token-address match is a guess, so it only fills in when
      // nothing is identified by the address.
      const candidates =
        byIdentifier[chain]?.[poolAddress] ||
        byPositionToken[chain]?.[poolAddress];
      if (!candidates) return pool;

      const merklRewards = resolveRewards(candidates);
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
      if (changed && merklRewards.rewardTokens.length) {
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
        console.log('pool already has matching apy reward field(s)', pool.pool);
      }
      return changed ? updated : pool;
    });
  } catch (err) {
    console.log(`Failed to add Merkl reward apy to ${protocolId}: ${err}`);
    return pools;
  }
};
