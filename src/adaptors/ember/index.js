const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT = 'ember';
const BASE_URL = 'https://ember.so/';
const EARN_URL = 'https://ember.so/earn';
const VAULTS_URL = 'https://vaults.api.prod.ember.so/api/v2/vaults';

const poolUrl = (receiptSymbol) =>
  receiptSymbol ? `${EARN_URL}/${receiptSymbol}` : BASE_URL;

const E9 = 1e9;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const SUI_LOOKBACK_SECONDS = 30 * 24 * 60 * 60;
const MIN_TVL_USD = 10_000;
const ONE_SHARE_E18 = (10n ** 18n).toString();

const CHAIN_DISPLAY = {
  ethereum: 'Ethereum',
  monad: 'Monad',
  sui: 'Sui',
};

const BLACKLISTED_VAULTS = new Set([
  '0xb3ccbc12cd633d3a8da0cf97a4d89f771a9bd8c0cd8ce321de13edc11cfb3e1c',
]);

const TOTAL_ASSETS_ABI = 'uint256:totalAssets';
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256) view returns (uint256)';

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const sharePriceApy = (now, past, days) => {
  const n = Number(now);
  const p = Number(past);
  if (!Number.isFinite(n) || !Number.isFinite(p) || n <= 0 || p <= 0) {
    return null;
  }
  return (n / p) ** (365 / days) * 100 - 100;
};

const apiApy = (vault) => {
  const reported = vault.reportedApy || {};
  const avg7d = (vault.apyAverages && vault.apyAverages['7d']) || {};
  const live = toNum(reported.reportedApyE9);
  const past = toNum(avg7d.reportedApyE9);
  return ((live > 0 ? live : past) / E9) * 100;
};

const apiRewardApy = (vault) =>
  (toNum(vault.reportedApy?.rewardApyE9) / E9) * 100;

const rewardTokenAddresses = (vault, apyReward) => {
  if (!(apyReward > 0)) return undefined;
  const rewards = Array.isArray(vault.rewards) ? vault.rewards : [];
  const addrs = rewards
    .map((r) => r?.address)
    .filter((a) => typeof a === 'string' && a.length > 0);
  return addrs.length ? addrs : undefined;
};

const collectVaultEntries = (vaults, chainKey) => {
  const out = [];
  for (const vault of vaults) {
    const details = vault.detailsByChain?.[chainKey];
    if (!details?.address) continue;
    if (BLACKLISTED_VAULTS.has(details.address.toLowerCase())) continue;
    const base = details.baseDepositCoin;
    if (!base?.address) continue;
    out.push({ vault, details, base });
  }
  return out;
};

const buildEvmPools = async (vaults, chainKey) => {
  const display = CHAIN_DISPLAY[chainKey];
  const entries = collectVaultEntries(vaults, chainKey);
  if (entries.length === 0) return [];

  const targets = entries.map((e) => ({ target: e.details.address }));
  const shareCalls = entries.map((e) => ({
    target: e.details.address,
    params: [ONE_SHARE_E18],
  }));

  const ts7dAgo = Math.floor(Date.now() / 1000) - WEEK_SECONDS;
  const blockResp = await utils.getPriceApiData(`/block/${chainKey}/${ts7dAgo}`);
  const block7dAgo = blockResp.height;

  const [totalAssetsRes, shareNowRes, sharePastRes] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: targets,
      chain: chainKey,
      abi: TOTAL_ASSETS_ABI,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: shareCalls,
      chain: chainKey,
      abi: CONVERT_TO_ASSETS_ABI,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: shareCalls,
      chain: chainKey,
      abi: CONVERT_TO_ASSETS_ABI,
      block: block7dAgo,
      permitFailure: true,
    }),
  ]);

  const uniqueBaseAddrs = [
    ...new Set(entries.map((e) => e.base.address.toLowerCase())),
  ];
  const { pricesByAddress } = await utils.getPrices(
    uniqueBaseAddrs,
    chainKey
  );

  const pools = [];
  for (let i = 0; i < entries.length; i++) {
    const { vault, details, base } = entries[i];
    const totalRaw = Number(totalAssetsRes.output[i]?.output || 0);
    if (totalRaw <= 0) continue;

    const baseAddr = base.address.toLowerCase();
    const price = pricesByAddress[baseAddr];
    if (!price) continue;

    const decimals = Number(base.decimals ?? 18);
    const tvlUsd = (totalRaw / 10 ** decimals) * price;
    if (tvlUsd < MIN_TVL_USD) continue;

    const onChainApy = sharePriceApy(
      shareNowRes.output[i]?.output,
      sharePastRes.output[i]?.output,
      7
    );
    const apyBase = onChainApy != null && onChainApy > 0 ? onChainApy : apiApy(vault);
    const apyReward = apiRewardApy(vault);
    const rewardTokens = rewardTokenAddresses(vault, apyReward);

    const shareDec = Number(details.receiptCoin?.decimals ?? decimals);
    const shareNowRaw = Number(shareNowRes.output[i]?.output);
    const pricePerShare =
      Number.isFinite(shareNowRaw) && shareNowRaw > 0
        ? (shareNowRaw * 10 ** shareDec) / (1e18 * 10 ** decimals)
        : undefined;

    pools.push({
      pool: `${details.address.toLowerCase()}-${chainKey}`,
      chain: display,
      project: PROJECT,
      symbol: base.symbol || 'UNKNOWN',
      tvlUsd,
      apyBase,
      ...(apyReward > 0 && { apyReward }),
      ...(pricePerShare && { pricePerShare }),
      underlyingTokens: [baseAddr],
      ...(rewardTokens && { rewardTokens }),
      poolMeta: vault.name,
      url: poolUrl(details.receiptCoin?.symbol),
    });
  }
  return pools;
};

const fetchSuiPrices = async (addresses) => {
  if (addresses.length === 0) return {};
  const keys = addresses.map((a) => `sui:${a}`).join(',');
  const data = await utils.getPriceApiData(`/prices/current/${keys}`);
  const coins = data?.coins || {};
  const out = {};
  for (const [key, value] of Object.entries(coins)) {
    const addr = key.slice('sui:'.length).toLowerCase();
    out[addr] = value.price;
  }
  return out;
};

// Sui vault objects store rate = receipt shares per deposit unit (1e9 scale),
// so the share price is 1e9 / rate and its growth is rateThen / rateNow.
const suiRates = async (addresses, atCheckpoint) =>
  (await utils.suiObjectFields(addresses, atCheckpoint)).map((fields) =>
    toNum(fields?.rate?.value)
  );

const buildSuiPools = async (vaults, chainKey) => {
  const display = CHAIN_DISPLAY[chainKey];
  const entries = collectVaultEntries(vaults, chainKey)
    .map((e) => ({ ...e, totalRaw: toNum(e.details.totalDeposits) }))
    .filter((e) => e.totalRaw > 0);
  if (entries.length === 0) return [];

  const uniqueBaseAddrs = [...new Set(entries.map((e) => e.base.address))];
  const vaultAddrs = entries.map((e) => e.details.address);
  // Best effort: if the reads fail, every vault falls back to the API apy.
  const readRates = async () => {
    // Some vaults step their rate every few days; a longer window reduces step-count swings.
    const checkpoint = await utils.suiCheckpointNear(
      Date.now() - SUI_LOOKBACK_SECONDS * 1000
    );
    const [now, past] = await Promise.all([
      suiRates(vaultAddrs),
      suiRates(vaultAddrs, checkpoint.sequenceNumber),
    ]);
    const days = (Date.now() - Date.parse(checkpoint.timestamp)) / 86400000;
    return { now, past, days };
  };
  const [prices, rates] = await Promise.all([
    fetchSuiPrices(uniqueBaseAddrs),
    readRates().catch((err) => {
      console.error('ember: sui vault rates unavailable:', err.message);
      return { now: [], past: [], days: 0 };
    }),
  ]);

  const pools = [];
  for (let i = 0; i < entries.length; i++) {
    const { vault, details, base, totalRaw } = entries[i];
    const price = prices[base.address.toLowerCase()];
    if (!price) continue;

    const decimals = Number(base.decimals ?? 9);
    const tvlUsd = (totalRaw / 10 ** decimals) * price;
    if (tvlUsd < MIN_TVL_USD) continue;

    const rateNow = rates.now[i];
    const onChainApy =
      rates.days >= 1
        ? sharePriceApy(rates.past[i], rateNow, rates.days)
        : null;
    const apyBase =
      onChainApy != null && onChainApy > 0 ? onChainApy : apiApy(vault);
    const apyReward = apiRewardApy(vault);
    const rewardTokens = rewardTokenAddresses(vault, apyReward);
    pools.push({
      pool: details.address,
      chain: display,
      project: PROJECT,
      symbol: base.symbol || 'UNKNOWN',
      tvlUsd,
      apyBase,
      ...(apyReward > 0 && { apyReward }),
      ...(rateNow > 0 && { pricePerShare: E9 / rateNow }),
      underlyingTokens: [base.address],
      ...(rewardTokens && { rewardTokens }),
      poolMeta: vault.name,
      url: poolUrl(details.receiptCoin?.symbol),
    });
  }
  return pools;
};

const apy = async () => {
  let vaults;
  try {
    ({ data: vaults } = await axios.get(VAULTS_URL));
  } catch (err) {
    console.error(`ember: failed to fetch ${VAULTS_URL}:`, err.message);
    throw err;
  }

  const [evmPools, monadPools, suiPools] = await Promise.all([
    buildEvmPools(vaults, 'ethereum'),
    buildEvmPools(vaults, 'monad'),
    buildSuiPools(vaults, 'sui'),
  ]);

  return [...evmPools, ...monadPools, ...suiPools]
    .filter((p) => utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  protocolId: '6741',
  timetravel: false,
  apy,
  url: BASE_URL,
};
