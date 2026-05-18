const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const VAULT_LIST_URL = 'https://api.arkonix.xyz/public/vaults';
const SECONDS_PER_DAY = 86400;

const CHAIN_BY_ID = {
  1: 'ethereum',
  42161: 'arbitrum',
};

const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) view returns (uint256)';

const getBlock = async (chain, timestamp) => {
  try {
    const { data } = await axios.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    return data.height;
  } catch (e) {
    return null;
  }
};

const safeCall = async (params) => {
  try {
    const res = await sdk.api.abi.call(params);
    return res.output;
  } catch (e) {
    return null;
  }
};

// Compound annualization of share-price drift. Same formula as the canonical
// utils.getERC4626Info helper in this repo and as Arkonix's own dashboard,
// so values match across surfaces and negative drift floors near -100%.
// Equal current/past prices return null so freshly-deployed vaults with no
// movement get filtered out instead of publishing a misleading 0% — same
// pattern as veda/index.js:64.
const annualize = (now, past, days) => {
  const a = Number(now);
  const b = Number(past);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0 || a === b) return null;
  return ((a / b) ** (365 / days) - 1) * 100;
};

const buildPool = async (vault) => {
  const chain = CHAIN_BY_ID[vault.chain_id];
  if (!chain) return null;

  const vaultAddress = String(vault.vault_address).toLowerCase();
  const shareToken = vault.share_token_address
    ? String(vault.share_token_address).toLowerCase()
    : null;
  const now = Math.floor(Date.now() / 1000);

  const [block1d, block7d] = await Promise.all([
    getBlock(chain, now - SECONDS_PER_DAY),
    getBlock(chain, now - 7 * SECONDS_PER_DAY),
  ]);

  const [shareDecRaw, assetAddrRaw] = await Promise.all([
    safeCall({ target: vaultAddress, abi: 'erc20:decimals', chain }),
    safeCall({ target: vaultAddress, abi: 'address:asset', chain }),
  ]);
  if (!assetAddrRaw) return null;

  const shareDecimals = Number(shareDecRaw) || 18;
  const assetAddress = String(assetAddrRaw).toLowerCase();
  const oneShare = (BigInt(10) ** BigInt(shareDecimals)).toString();

  const [assetDecRaw, totalAssetsRaw, ppsNow, pps1d, pps7d] = await Promise.all([
    safeCall({ target: assetAddress, abi: 'erc20:decimals', chain }),
    safeCall({ target: vaultAddress, abi: 'uint:totalAssets', chain }),
    safeCall({
      target: vaultAddress,
      abi: convertToAssetsAbi,
      chain,
      params: [oneShare],
    }),
    block1d
      ? safeCall({
          target: vaultAddress,
          abi: convertToAssetsAbi,
          chain,
          block: block1d,
          params: [oneShare],
        })
      : null,
    block7d
      ? safeCall({
          target: vaultAddress,
          abi: convertToAssetsAbi,
          chain,
          block: block7d,
          params: [oneShare],
        })
      : null,
  ]);

  if (!totalAssetsRaw || !ppsNow) return null;
  const assetDecimals = Number(assetDecRaw) || Number(vault.deposit_asset_decimals) || 18;

  const priceKey = `${chain}:${assetAddress}`;
  let assetPrice;
  try {
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
    assetPrice = data.coins?.[priceKey]?.price;
  } catch (e) {
    assetPrice = undefined;
  }
  if (!assetPrice) return null;

  const tvlUsd = (Number(totalAssetsRaw) / 10 ** assetDecimals) * assetPrice;
  const apyBase = annualize(ppsNow, pps1d, 1);
  const apyBase7d = annualize(ppsNow, pps7d, 7);
  const pricePerShare = Number(ppsNow) / 10 ** assetDecimals;

  const pool = {
    pool: `${vaultAddress}-${chain}`,
    chain: utils.formatChain(chain),
    project: 'arkonix',
    symbol: utils.formatSymbol(vault.deposit_asset_symbol || 'UNKNOWN'),
    tvlUsd,
    pricePerShare,
    underlyingTokens: [assetAddress],
    poolMeta: vault.name,
    url: 'https://app.arkonix.xyz/',
  };
  if (Number.isFinite(apyBase)) pool.apyBase = apyBase;
  else if (Number.isFinite(apyBase7d)) pool.apyBase = apyBase7d;
  if (Number.isFinite(apyBase7d)) pool.apyBase7d = apyBase7d;
  if (shareToken) pool.token = shareToken;
  return pool;
};

const apy = async () => {
  const { data } = await axios.get(VAULT_LIST_URL);
  const vaults = (data.share_classes || []).flatMap((sc) =>
    (sc.vaults || []).map((v) => ({
      ...v,
      share_token_address: sc.share_token_address,
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
  timetravel: false,
  apy,
  url: 'https://app.arkonix.xyz/',
};
