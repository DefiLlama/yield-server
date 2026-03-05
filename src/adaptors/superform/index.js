const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT_NAME = 'superform';

const API_BASE = 'https://persephone.superform.xyz/v1';

// SuperVault Aggregator contract - returns all SuperVaults
const SUPERVAULT_AGGREGATOR = '0x10AC0b33e1C4501CF3ec1cB1AE51ebfdbd2d4698';

const CHAIN_MAPPING = {
  '1': 'ethereum',
};

// ERC-4626 ABI for totalAssets and asset
const abi = {
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  asset: {
    inputs: [],
    name: 'asset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  decimals: {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const main = async () => {
  // Fetch SuperVaults metadata from API (for APY and symbol info)
  const supervaultsRes = await utils.getData(`${API_BASE}/supervaults`);
  const supervaults = supervaultsRes?.supervaults || [];

  // Filter to only Ethereum SuperVaults (currently all are on Ethereum)
  const ethSupervaults = supervaults.filter(
    (v) => v.chain_id === '1' && v.stats_basic?.apy_snapshot_now > -100
  );

  if (ethSupervaults.length === 0) {
    return [];
  }

  const vaultAddresses = ethSupervaults.map((v) => v.address);

  // Fetch on-chain data: totalAssets, asset address, and decimals
  const [totalAssetsRes, assetRes] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abi.totalAssets,
      calls: vaultAddresses.map((address) => ({ target: address })),
      chain: 'ethereum',
    }),
    sdk.api.abi.multiCall({
      abi: abi.asset,
      calls: vaultAddresses.map((address) => ({ target: address })),
      chain: 'ethereum',
    }),
  ]);

  // Get unique asset addresses for decimals lookup (lowercase for consistency)
  const assetAddresses = [
    ...new Set(
      assetRes.output
        .filter((r) => r && r.output)
        .map((r) => r.output.toLowerCase())
    ),
  ];

  const decimalsRes = await sdk.api.abi.multiCall({
    abi: abi.decimals,
    calls: assetAddresses.map((address) => ({ target: address })),
    chain: 'ethereum',
  });

  const decimalsMap = {};
  decimalsRes.output.forEach((r) => {
    decimalsMap[r.input.target.toLowerCase()] = r.output;
  });

  // Get token prices (use lowercase addresses)
  const priceKeys = assetAddresses.map((a) => `ethereum:${a}`).join(',');
  const pricesRes = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  // Normalize price keys to lowercase for lookup
  const prices = {};
  for (const [key, value] of Object.entries(pricesRes.coins || {})) {
    prices[key.toLowerCase()] = value;
  }

  // Build pools
  const pools = [];

  for (let i = 0; i < ethSupervaults.length; i++) {
    const vault = ethSupervaults[i];
    const totalAssets = totalAssetsRes.output[i]?.output;
    const rawAsset = assetRes.output[i]?.output;

    if (!totalAssets || !rawAsset) continue;

    const assetAddress = rawAsset.toLowerCase();
    const decimals = decimalsMap[assetAddress] || 18;
    const priceKey = `ethereum:${assetAddress}`;
    const price = prices[priceKey]?.price;

    if (!price) continue;

    const tvlUsd = (Number(totalAssets) / 10 ** decimals) * price;
    if (tvlUsd <= 0) continue;

    const apy = vault.stats_basic?.apy_snapshot_now;
    if (apy === undefined || apy === null || apy < -100) continue;

    const symbol =
      vault.symbol || vault.assets?.[0]?.symbol || vault.friendly_name || 'UNKNOWN';

    const pool = {
      pool: `superform-${vault.address}-ethereum`.toLowerCase(),
      chain: utils.formatChain('Ethereum'),
      project: PROJECT_NAME,
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase: apy,
      underlyingTokens: [assetAddress],
      poolMeta: 'SuperVault',
      url: `https://app.superform.xyz/vault/1_${vault.address}`,
    };

    pools.push(pool);
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.superform.xyz/earn',
};
