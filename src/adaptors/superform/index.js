const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT_NAME = 'superform';

const API_BASE = 'https://persephone.superform.xyz/v1';

const CHAIN_MAPPING = {
  '1': 'ethereum',
  '8453': 'base',
};

const main = async () => {
  // Fetch SuperVaults metadata from API (for vault addresses and symbols)
  const supervaultsRes = await utils.getData(`${API_BASE}/supervaults`);
  const supervaults = supervaultsRes?.supervaults || [];

  // Group vaults by chain
  const vaultsByChain = {};
  for (const v of supervaults) {
    const chain = CHAIN_MAPPING[v.chain_id];
    if (!chain) continue;
    if (!vaultsByChain[chain]) vaultsByChain[chain] = [];
    vaultsByChain[chain].push(v);
  }

  const pools = [];

  for (const [chain, chainVaults] of Object.entries(vaultsByChain)) {
    const vaultAddresses = chainVaults.map((v) => v.address);

    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 86400 * 7;
    const [blockNow, blockWeekAgo] = await utils.getBlocksByTime(
      [now, weekAgo],
      chain
    );

    // Fetch on-chain data at current and 7-day-ago blocks
    const [
      totalAssetsNowRes,
      totalSupplyNowRes,
      totalAssetsWeekAgoRes,
      totalSupplyWeekAgoRes,
      assetRes,
    ] = await Promise.all([
      sdk.api.abi.multiCall({
        abi: 'uint256:totalAssets',
        calls: vaultAddresses.map((target) => ({ target })),
        chain,
        block: blockNow,
      }),
      sdk.api.abi.multiCall({
        abi: 'uint256:totalSupply',
        calls: vaultAddresses.map((target) => ({ target })),
        chain,
        block: blockNow,
      }),
      sdk.api.abi.multiCall({
        abi: 'uint256:totalAssets',
        calls: vaultAddresses.map((target) => ({ target })),
        chain,
        block: blockWeekAgo,
      }),
      sdk.api.abi.multiCall({
        abi: 'uint256:totalSupply',
        calls: vaultAddresses.map((target) => ({ target })),
        chain,
        block: blockWeekAgo,
      }),
      sdk.api.abi.multiCall({
        abi: 'address:asset',
        calls: vaultAddresses.map((target) => ({ target })),
        chain,
      }),
    ]);

    // Get unique asset addresses for decimals + prices
    const assetAddresses = [
      ...new Set(
        assetRes.output
          .filter((r) => r && r.output)
          .map((r) => r.output.toLowerCase())
      ),
    ];

    const decimalsRes = await sdk.api.abi.multiCall({
      abi: 'uint8:decimals',
      calls: assetAddresses.map((target) => ({ target })),
      chain,
    });

    const decimalsMap = {};
    decimalsRes.output.forEach((r) => {
      decimalsMap[r.input.target.toLowerCase()] = r.output;
    });

    const priceKeys = assetAddresses.map((a) => `${chain}:${a}`).join(',');
    const pricesRes = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKeys}`
    );

    const prices = {};
    for (const [key, value] of Object.entries(pricesRes.coins || {})) {
      prices[key.toLowerCase()] = value;
    }

    for (let i = 0; i < chainVaults.length; i++) {
      const vault = chainVaults[i];
      const rawAsset = assetRes.output[i]?.output;
      if (!rawAsset) continue;

      const assetsNow = Number(totalAssetsNowRes.output[i]?.output);
      const supplyNow = Number(totalSupplyNowRes.output[i]?.output);
      const assetsPast = Number(totalAssetsWeekAgoRes.output[i]?.output);
      const supplyPast = Number(totalSupplyWeekAgoRes.output[i]?.output);

      if (!supplyNow || !assetsNow) continue;

      const assetAddress = rawAsset.toLowerCase();
      const decimals = decimalsMap[assetAddress] || 18;
      const price = prices[`${chain}:${assetAddress}`]?.price;
      if (!price) continue;

      const tvlUsd = (assetsNow / 10 ** decimals) * price;
      if (tvlUsd <= 0) continue;

      // APY from 7-day share price change: (priceNow / pricePast) ^ (365/7) - 1
      let apyBase = 0;
      const priceNow = assetsNow / supplyNow;
      if (supplyPast > 0 && assetsPast > 0) {
        const pricePast = assetsPast / supplyPast;
        apyBase = (Math.pow(priceNow / pricePast, 365 / 7) - 1) * 100;
        apyBase = Math.max(apyBase, 0);
      }

      const symbol =
        vault.symbol ||
        vault.assets?.[0]?.symbol ||
        vault.friendly_name ||
        'UNKNOWN';

      // Extract reward APY and token addresses from API data
      const tokenRewards = (vault.rewards || []).filter(
        (r) => r.type === 'token' && r.reward_rate > 0 && r.address
      );
      const apyReward = tokenRewards.reduce(
        (sum, r) => sum + (r.reward_rate || 0),
        0
      );
      const rewardTokens = tokenRewards.map((r) => r.address.toLowerCase());

      const poolData = {
        pool: `superform-${vault.address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: PROJECT_NAME,
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        // SuperVault shares are 18-dec; assets in own decimals.
        ...(priceNow * 10 ** (18 - decimals) > 0 && { pricePerShare: priceNow * 10 ** (18 - decimals) }),
        underlyingTokens: [assetAddress],
        poolMeta: 'SuperVault',
        url: `https://app.superform.xyz/vault/${vault.chain_id}_${vault.address}`,
      };

      if (apyReward > 0) {
        poolData.apyReward = apyReward;
        poolData.rewardTokens = rewardTokens;
      }

      pools.push(poolData);
    }
  }

  return addMerklRewardApy(pools.filter((p) => utils.keepFinite(p)), 'superform');
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.superform.xyz/earn',
};
