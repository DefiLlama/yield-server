const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Barker (https://barker.money) runs boost campaigns on top of third-party
// vaults (non-custodial): user principal is deposited directly into the
// underlying protocol's own vault, and Barker distributes boosted rewards on
// top. This adapter lists vaults with an active Barker boost — same pattern
// as the merkl adaptor (pool suffix `-barker`, apyReward = boost on top of
// the vault's native APY).
const API_BASE = 'https://api.barker.money/api';

// Barker chain_uid → defillama chain slug (unsupported chains are skipped)
const CHAIN_SLUG = {
  ethereum: 'ethereum',
  hyperevm: 'hyperliquid',
};

const apy = async () => {
  const campaignsRes = await utils.getData(`${API_BASE}/protocols/campaigns`);
  const campaigns = (campaignsRes?.data?.campaigns ?? []).filter(
    (c) => !c.is_cex && c.is_active
  );
  const protocolUids = [...new Set(campaigns.map((c) => c.protocol_uid))];

  const pools = [];
  for (const uid of protocolUids) {
    let vaults = [];
    try {
      const res = await utils.getData(
        `${API_BASE}/campaigns/protocol/${encodeURIComponent(uid)}/boost-vaults`
      );
      vaults = res?.data?.vaults ?? [];
    } catch (e) {
      continue; // protocol without boost vaults
    }

    for (const v of vaults) {
      if (!v.barker_boost_enabled || v.boost_status !== 'active') continue;
      const chain = CHAIN_SLUG[v.chain_uid];
      if (!chain || !v.vault_address || !v.asset_address) continue;

      // ERC-4626 vault TVL = totalAssets × underlying price
      const totalAssets = (
        await sdk.api.abi.call({
          target: v.vault_address,
          abi: 'uint256:totalAssets',
          chain,
        })
      ).output;
      const priceKey = `${chain}:${v.asset_address}`;
      const priceRes = await utils.getData(
        `https://coins.llama.fi/prices/current/${priceKey}`
      );
      const price = priceRes?.coins?.[priceKey]?.price;
      if (price == null) continue;
      const tvlUsd =
        (Number(totalAssets) / 10 ** Number(v.asset_decimals ?? 18)) * price;

      const apyBase = Number(v.base_apy ?? 0) * 100;
      const apyReward = Math.max(
        0,
        (Number(v.total_pool_apy ?? 0) - Number(v.base_apy ?? 0)) * 100
      );
      if (!apyReward) continue; // only list pools with a live Barker boost

      pools.push({
        pool: `${v.vault_address}-barker`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'barker',
        symbol: utils.formatSymbol(
          String(v.asset || v.share_symbol || '').toUpperCase()
        ),
        tvlUsd,
        apyBase,
        apyReward,
        rewardTokens: [v.reward_token_address].filter(Boolean),
        underlyingTokens: [v.asset_address].filter(Boolean),
        poolMeta: v.campaign_name
          ? `Barker boost — ${v.campaign_name}`
          : 'Barker boost',
        url: 'https://app.barker.money/campaigns',
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.barker.money/campaigns',
};
