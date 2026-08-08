const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abi');

const CHAIN = 'ethereum';
const PROJECT = 'symbiotic';

// One factory mints two vault generations, split on version():
//   v2 (>= 3) ERC-4626 curator vaults. Yield accrues into the share price.
//   v1 (<  3) restaking vaults. Not ERC-4626, not even ERC-20 — symbol()/name()/totalSupply()
//             revert, accounting is activeShares()/activeStake(), and the share price never
//             appreciates. Yield is paid out as discrete reward distributions instead.
const VAULT_FACTORY = '0xAEb6bdd95c502390db8f52c8909F703E9Af6a346';
const MIN_V2_VERSION = 3;

// v1 rewards come from DefaultStakerRewards instances, one per vault, minted by these two
// registries. instance.VAULT() is the only link back — the vault holds no pointer to its rewarder.
const STAKER_REWARDS_FACTORIES = [
  '0xFEB871581C2ab2e1EEe6f7dDC7e6246cFa087A23',
  '0x290CAB97a312164Ccf095d75D6175dF1C4A0a25F',
];

// Display names only: v1 vaults revert on name().
const METADATA_BASE =
  'https://raw.githubusercontent.com/symbioticfi/metadata-mainnet/main/vaults';

const MIN_TVL_USD = 10000;

// v2 apyBase is price-per-share growth over this window, annualised geometrically since the share
// price compounds. Curator and protocol fees are taken by minting shares and are counted in
// totalSupply(), so convertToAssets() is already net of them.
const LOOKBACK_DAYS = 7;

// v1 apyReward is everything distributed inside this sliding window over TVL, annualised
// linearly — reward tokens are paid out rather than reinvested, so they do not compound.
const REWARD_WINDOW_DAYS = 30;

const DAY = 86400;

const toLower = (s) => String(s).toLowerCase();
const toNum = (v) => (v == null ? NaN : Number(v));

const getBlockAtTimestamp = async (ts) => {
  const data = await utils.getPriceApiData(`/block/${CHAIN}/${ts}`);
  return { block: data.height || data.number, ts: data.timestamp || ts };
};

/** Registries all expose totalEntities()/entity(i). */
const enumerateFactory = async (api, target) => {
  const total = Number(await api.call({ abi: abi.totalEntities, target }));
  return api.multiCall({
    abi: abi.entity,
    calls: [...Array(total).keys()].map((params) => ({ target, params })),
  });
};

/** Rewards distributed to each v1 vault inside the window, from DistributeRewards logs. */
const getRewardsByVault = async (api, v1Vaults, fromBlock, toBlock) => {
  const rewarderLists = await Promise.all(
    STAKER_REWARDS_FACTORIES.map((f) => enumerateFactory(api, f))
  );
  const rewarders = rewarderLists.flat();
  if (!rewarders.length) return {};

  const vaults = await api.multiCall({
    abi: abi.vault,
    calls: rewarders.map((target) => ({ target })),
    permitFailure: true,
  });
  const vaultByRewarder = {};
  rewarders.forEach((rewarder, i) => {
    if (vaults[i] && v1Vaults.has(toLower(vaults[i]))) {
      vaultByRewarder[toLower(rewarder)] = toLower(vaults[i]);
    }
  });
  if (!Object.keys(vaultByRewarder).length) return {};

  const logs = await sdk.getEventLogs({
    chain: CHAIN,
    targets: Object.keys(vaultByRewarder),
    eventAbi: abi.distributeRewards,
    fromBlock,
    toBlock,
    flatten: true,
  });

  // distributeAmount is already net of the rewarder's adminFee.
  const byVault = {};
  for (const log of logs) {
    const vault = vaultByRewarder[toLower(log.address || '')];
    const amount = toNum(log.args.distributeAmount);
    if (!vault || !(amount > 0)) continue;
    const token = toLower(log.args.token);
    byVault[vault] = byVault[vault] || {};
    byVault[vault][token] = (byVault[vault][token] || 0) + amount;
  }
  return byVault;
};

/** Display names from the public metadata repo; a miss just drops poolMeta. */
const getVaultNames = async (vaults) =>
  Object.fromEntries(
    (
      await Promise.all(
        vaults.map((vault) =>
          axios
            .get(`${METADATA_BASE}/${vault}/info.json`, { timeout: 10000 })
            .then(({ data }) => [toLower(vault), data?.name?.trim() || null])
            .catch(() => [toLower(vault), null])
        )
      )
    ).filter(([, name]) => name)
  );

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });

  // Resolve blocks from timestamps rather than assuming a slot interval, so the annualisation
  // exponent below uses the elapsed time actually observed.
  const nowTs = Math.floor(Date.now() / 1000);
  const [tip, lookback, rewardWindow] = await Promise.all([
    getBlockAtTimestamp(nowTs),
    getBlockAtTimestamp(nowTs - LOOKBACK_DAYS * DAY),
    getBlockAtTimestamp(nowTs - REWARD_WINDOW_DAYS * DAY),
  ]);

  const allVaults = await enumerateFactory(api, VAULT_FACTORY);
  const versions = await api.multiCall({
    abi: abi.version,
    calls: allVaults.map((target) => ({ target })),
    permitFailure: true,
  });
  const v1 = allVaults.filter((_, i) => versions[i] != null && +versions[i] < MIN_V2_VERSION);
  const v2 = allVaults.filter((_, i) => versions[i] != null && +versions[i] >= MIN_V2_VERSION);

  const v1Calls = v1.map((target) => ({ target }));
  const v2Calls = v2.map((target) => ({ target }));
  const [collaterals, stakes, assets, totalAssets, shareDecimals, v2Symbols, v2Names, rewardsByVault] =
    await Promise.all([
      api.multiCall({ abi: abi.collateral, calls: v1Calls, permitFailure: true }),
      api.multiCall({ abi: abi.activeStake, calls: v1Calls, permitFailure: true }),
      api.multiCall({ abi: abi.asset, calls: v2Calls, permitFailure: true }),
      api.multiCall({ abi: abi.totalAssets, calls: v2Calls, permitFailure: true }),
      api.multiCall({ abi: 'erc20:decimals', calls: v2Calls, permitFailure: true }),
      api.multiCall({ abi: 'erc20:symbol', calls: v2Calls, permitFailure: true }),
      api.multiCall({ abi: 'string:name', calls: v2Calls, permitFailure: true }),
      getRewardsByVault(api, new Set(v1.map(toLower)), rewardWindow.block, tip.block),
    ]);

  const tokens = [
    ...new Set(
      [...collaterals, ...assets]
        .filter(Boolean)
        .map(toLower)
        .concat(Object.values(rewardsByVault).flatMap(Object.keys))
    ),
  ];
  const [tokenDecimals, { pricesByAddress: prices }] = await Promise.all([
    api.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((target) => ({ target })),
      permitFailure: true,
    }),
    utils.getPrices(tokens, CHAIN),
  ]);
  const decimals = Object.fromEntries(tokens.map((t, i) => [t, Number(tokenDecimals[i])]));
  const usd = (token, raw) =>
    prices[token] === undefined || !Number.isFinite(decimals[token])
      ? NaN
      : (raw / 10 ** decimals[token]) * prices[token];

  // ---- v2: price-per-share growth over LOOKBACK_DAYS ---------------------------------------
  const past = new sdk.ChainApi({ chain: CHAIN, block: lookback.block });
  const elapsedDays = Math.max((tip.ts - lookback.ts) / DAY, 1 / 24);
  // Share decimals are 18 even when the underlying is not (USDC is 6).
  const ppsCalls = v2.map((target, i) => ({
    target,
    params: [(10n ** BigInt(Number(shareDecimals[i]) || 18)).toString()],
  }));
  const [ppsNow, ppsPast] = await Promise.all([
    api.multiCall({ abi: abi.convertToAssets, calls: ppsCalls, permitFailure: true }),
    past.multiCall({ abi: abi.convertToAssets, calls: ppsCalls, permitFailure: true }),
  ]);

  const v2Pools = v2.map((vault, i) => {
    const token = assets[i] && toLower(assets[i]);
    const tvlUsd = token ? usd(token, toNum(totalAssets[i])) : NaN;
    const now = toNum(ppsNow[i]);
    const then = toNum(ppsPast[i]);
    if (!(tvlUsd >= MIN_TVL_USD) || !(now > 0)) return null;

    // A vault younger than the window has no historical share price; publish it with apyBase 0
    // rather than withholding the pool. The management fee accrues regardless of performance, so
    // price per share can also fall in a flat week — floor at 0 rather than going negative.
    const growth = then > 0 ? now / then : 1;
    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(v2Symbols[i] || 'UNKNOWN'),
      tvlUsd,
      apyBase: growth > 1 ? (growth ** (365 / elapsedDays) - 1) * 100 : 0,
      // Yield accrues into the share price; there is no separate reward stream.
      apyReward: 0,
      rewardTokens: [],
      underlyingTokens: [token],
      pricePerShare: now / 10 ** decimals[token],
      token: toLower(vault), // the v2 vault IS its ERC-4626 share token
      poolMeta: v2Names[i] || undefined,
      url: `https://app.symbiotic.fi/vault/${vault}`,
    };
  });

  // ---- v1: rewards distributed inside REWARD_WINDOW_DAYS ------------------------------------
  const v1Tvl = v1.map((vault, i) =>
    collaterals[i] ? usd(toLower(collaterals[i]), toNum(stakes[i])) : NaN
  );
  const publishable = v1.filter((_, i) => v1Tvl[i] >= MIN_TVL_USD);
  const [names, collateralSymbols] = await Promise.all([
    getVaultNames(publishable),
    api.multiCall({
      abi: 'erc20:symbol',
      calls: v1.map((_, i) => ({ target: collaterals[i] || VAULT_FACTORY })),
      permitFailure: true,
    }),
  ]);

  const v1Pools = v1.map((vault, i) => {
    const tvlUsd = v1Tvl[i];
    if (!(tvlUsd >= MIN_TVL_USD) || !collateralSymbols[i]) return null;

    // Reward APR over the sliding window. No distributions gives 0, which is a real 0.
    const distributions = rewardsByVault[toLower(vault)] || {};
    const rewardTokens = [];
    let rewardUsd = 0;
    for (const [token, raw] of Object.entries(distributions)) {
      const value = usd(token, raw);
      if (!(value > 0)) continue;
      rewardUsd += value;
      rewardTokens.push(token);
    }
    const apyReward = (rewardUsd / tvlUsd) * (365 / REWARD_WINDOW_DAYS) * 100;
    if (!Number.isFinite(apyReward)) return null;

    return {
      pool: `${vault}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(collateralSymbols[i]),
      tvlUsd,
      // 0 by construction: a v1 position does not appreciate, and the collateral's own yield is
      // published by the LST's own pool.
      apyBase: 0,
      apyReward,
      rewardTokens: apyReward > 0 ? rewardTokens : [],
      underlyingTokens: [toLower(collaterals[i])],
      // No transferable ERC-20 represents a v1 position, so suppress the pool-id fallback.
      token: null,
      poolMeta: names[toLower(vault)] || undefined,
      url: `https://app.symbiotic.fi/vault/${vault}`,
    };
  });

  return [...v2Pools, ...v1Pools].filter(Boolean).filter(utils.keepFinite);
};

module.exports = {
  protocolId: '4757',
  timetravel: false,
  apy,
  url: 'https://app.symbiotic.fi/deposit',
};
