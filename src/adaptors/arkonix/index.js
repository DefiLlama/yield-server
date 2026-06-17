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

const safeCall = async (params) => {
  try {
    const res = await sdk.api.abi.call(params);
    return res.output;
  } catch (e) {
    return null;
  }
};

const buildPool = async (vault) => {
  const chain = CHAIN_BY_ID[vault.chain_id];
  if (!chain) return null;

  const vaultAddress = String(vault.vault_address).toLowerCase();
  const shareToken = vault.share_token_address
    ? String(vault.share_token_address).toLowerCase()
    : null;

  const [shareDecRaw, assetAddrRaw] = await Promise.all([
    safeCall({ target: vaultAddress, abi: 'erc20:decimals', chain }),
    safeCall({ target: vaultAddress, abi: 'address:asset', chain }),
  ]);
  if (!assetAddrRaw) return null;

  const shareDecimals = Number(shareDecRaw) || 18;
  const assetAddress = String(assetAddrRaw).toLowerCase();
  const oneShare = (BigInt(10) ** BigInt(shareDecimals)).toString();

  const [assetDecRaw, totalAssetsRaw, ppsNow] = await Promise.all([
    safeCall({ target: assetAddress, abi: 'erc20:decimals', chain }),
    safeCall({ target: vaultAddress, abi: 'uint:totalAssets', chain }),
    safeCall({
      target: vaultAddress,
      abi: convertToAssetsAbi,
      chain,
      params: [oneShare],
    }),
  ]);

  if (!totalAssetsRaw || !ppsNow) return null;
  const assetDecimals =
    Number(assetDecRaw) || Number(vault.deposit_asset_decimals) || 18;

  const priceKey = `${chain}:${assetAddress}`;
  let assetPrice;
  try {
    const data = await utils.getPriceApiData(`/prices/current/${priceKey}`);
    assetPrice = data.coins?.[priceKey]?.price;
  } catch (e) {
    assetPrice = undefined;
  }
  if (!assetPrice) return null;

  const tvlUsd = (Number(totalAssetsRaw) / 10 ** assetDecimals) * assetPrice;
  const pricePerShare = Number(ppsNow) / 10 ** assetDecimals;

  // Use the protocol's published 7-day APY (the exact figure shown on
  // app.arkonix.xyz) instead of annualizing an on-chain share-price drift.

  const apyBase = vault.apy_7d == null ? NaN : Number(vault.apy_7d);

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

const apy = async () => {
  const { data } = await axios.get(VAULT_LIST_URL);
  const vaults = (data.share_classes || []).flatMap((sc) =>
    (sc.vaults || []).map((v) => ({
      ...v,
      share_token_address: sc.share_token_address,
      apy_7d: sc.apy_7d,
    }))
  );

  const pools = [];
  for (const vault of vaults) {
    try {
      const p = await buildPool(vault);
      if (p) pools.push(p);
    } catch (e) {
      console.error(
        `arkonix: vault ${vault.vault_address} failed: ${e.message}`
      );
    }
  }
  return pools.filter(utils.keepFinite);
};

module.exports = {
  protocolId: '7865',
  timetravel: false,
  apy,
  url: 'https://app.arkonix.xyz/',
};
