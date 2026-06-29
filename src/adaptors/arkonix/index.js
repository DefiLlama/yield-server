const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const VAULT_LIST_URL = 'https://api.arkonix.xyz/public/vaults';
const APP_URL = 'https://app.arkonix.xyz';

const CHAIN_BY_ID = {
  1: 'ethereum',
  42161: 'arbitrum',
};

const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) view returns (uint256)';
const ONE_SHARE = (BigInt(10) ** BigInt(18)).toString();

const safeMultiCall = async ({ chain, abi, calls }) => {
  try {
    const { output } = await sdk.api.abi.multiCall({
      chain,
      abi,
      calls,
      permitFailure: true,
    });
    return output.map((res) => (res?.success === false ? null : res?.output));
  } catch (e) {
    return calls.map(() => null);
  }
};

const skipRpcCheck = async (fn) => {
  const previous = process.env.SKIP_RPC_CHECK;
  process.env.SKIP_RPC_CHECK = 'true';
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.SKIP_RPC_CHECK;
    else process.env.SKIP_RPC_CHECK = previous;
  }
};

const buildPool = (vault) => {
  const chain = CHAIN_BY_ID[vault.chain_id];
  if (!chain) return null;

  const vaultAddress = String(vault.vault_address).toLowerCase();
  const shareToken = vault.share_token_address
    ? String(vault.share_token_address).toLowerCase()
    : null;
  const {
    assetAddress,
    assetDecimals,
    totalAssetsRaw,
    ppsNow,
    assetPrice,
  } = vault;

  if (!totalAssetsRaw || !ppsNow) return null;
  if (!assetPrice) return null;

  const tvlUsd = (Number(totalAssetsRaw) / 10 ** assetDecimals) * assetPrice;
  const pricePerShare = Number(ppsNow) / 10 ** assetDecimals;

  // Use the protocol's published 7-day APY (the exact figure shown on
  // app.arkonix.xyz) instead of annualizing an on-chain share-price drift.

  const apyBase =
    vault.apy_7d == null ? Number(vault.return_7d_pct) : Number(vault.apy_7d);

  const pool = {
    pool: `${vaultAddress}-${chain}-arkonix`,
    chain: utils.formatChain(chain),
    project: 'arkonix',
    symbol: vault.deposit_asset_symbol || 'UNKNOWN',
    tvlUsd,
    pricePerShare,
    underlyingTokens: [assetAddress],
    poolMeta: vault.name,
    url: `${APP_URL}/earn/${vaultAddress}`,
  };
  if (Number.isFinite(apyBase)) pool.apyBase = apyBase;
  if (shareToken) pool.token = shareToken;
  return pool;
};

const getApy = async () => {
  const { data } = await axios.get(VAULT_LIST_URL);
  const vaults = (data.share_classes || []).flatMap((sc) =>
    (sc.vaults || []).map((v) => ({
      ...v,
      share_token_address: sc.share_token_address,
      apy_7d: sc.apy_7d,
      return_7d_pct: sc.return_7d_pct,
    }))
  );

  const pools = [];
  for (const chain of [...new Set(vaults.map((vault) => vault.chain_id))]) {
    const chainVaults = vaults.filter((vault) => vault.chain_id === chain);
    const chainName = CHAIN_BY_ID[chain];
    if (!chainName) continue;

    const calls = chainVaults.map((vault) => ({
      target: String(vault.vault_address).toLowerCase(),
    }));

    const [assets, totalAssets, pps] = await Promise.all([
      safeMultiCall({ chain: chainName, abi: 'address:asset', calls }),
      safeMultiCall({ chain: chainName, abi: 'uint:totalAssets', calls }),
      safeMultiCall({
        chain: chainName,
        abi: convertToAssetsAbi,
        calls: calls.map((call) => ({ ...call, params: [ONE_SHARE] })),
      }),
    ]);

    const uniqueAssets = [
      ...new Set(
        assets.filter(Boolean).map((asset) => String(asset).toLowerCase())
      ),
    ];
    const assetDecimals = uniqueAssets.length
      ? await safeMultiCall({
          chain: chainName,
          abi: 'erc20:decimals',
          calls: uniqueAssets.map((asset) => ({ target: asset })),
        })
      : [];
    const decimalsByAsset = new Map(
      uniqueAssets.map((asset, i) => [asset, Number(assetDecimals[i])])
    );
    let pricesByAddress = {};
    if (uniqueAssets.length) {
      try {
        pricesByAddress = (await utils.getPrices(uniqueAssets, chainName))
          .pricesByAddress;
      } catch (e) {}
    }

    chainVaults.forEach((vault, i) => {
      const assetAddress = assets[i] ? String(assets[i]).toLowerCase() : null;
      const p = buildPool({
        ...vault,
        assetAddress,
        assetDecimals:
          decimalsByAsset.get(assetAddress) ||
          Number(vault.deposit_asset_decimals) ||
          18,
        totalAssetsRaw: totalAssets[i],
        ppsNow: pps[i],
        assetPrice: pricesByAddress[assetAddress],
      });
      if (p) pools.push(p);
    });
  }
  return pools.filter(utils.keepFinite);
};

const apy = async () => skipRpcCheck(getApy);

module.exports = {
  protocolId: '7865',
  timetravel: false,
  apy,
  url: 'https://app.arkonix.xyz/',
};
