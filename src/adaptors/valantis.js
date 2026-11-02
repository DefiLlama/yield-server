const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { getPriceApiData } = require('./utils');

const chain = 'hyperliquid';
const STHYPE = '0xffaa4a3d97fe9107cef8a3f48c069f577ff76cc1';
const WHYPE = '0x5555555555555555555555555555555555555555';
const ESCROW = '0x0447d0339c82a8efe01994b7d1981bf5c517da0e';
const SEED = '0x0000000000000000000000000000000000000001';
const ORIGINAL_MODULE = '0x40ba056b004edd0b572509a1276fd8530cf2bb7f';
const RAW_SHARE = '1000000000000000000000000';
// Verified HyperEVM deployment blocks; dates are not substituted for block guards.
const configs = {
  sthype: { project: 'sthype', address: STHYPE, block: 25412, symbol: 'stHYPE', url: 'https://app.valantis.xyz/vaults' },
  sthypeStex: { project: 'valantis-stex', address: '0x39694eff3b02248929120c73f90347013aec834d', block: 1937868, symbol: 'stHYPE-HYPE', url: 'https://app.valantis.xyz/vaults' },
  khypeStex: { project: 'valantis-stex', address: '0xbf747d2959f03332dbd25249db6f00f62c6cb526', block: 7773262, symbol: 'kHYPE-HYPE', url: 'https://app.valantis.xyz/vaults' },
  restaking: { project: 'valantis-sthype-restaking', address: ESCROW, block: 47206861, symbol: 'stHYPE', url: 'https://app.valantis.xyz/restaking' },
};

/** Compound a rational exchange-rate change over actual elapsed seconds, retaining losses. */
function annualized(before, after, elapsed) {
  if (elapsed <= 0 || before.numerator <= 0n || before.denominator <= 0n || after.numerator <= 0n || after.denominator <= 0n)
    throw new Error('Valantis APY requires positive exchange rates and elapsed time');
  const change = new BigNumber((after.numerator * before.denominator).toString())
    .div((before.numerator * after.denominator).toString()).minus(1).toNumber();
  const result = Math.expm1(Math.log1p(change) * 31536000 / elapsed) * 100;
  if (!Number.isFinite(result)) throw new Error('Valantis annualized return is not finite');
  return result; // Preserve genuine zero and negative realized returns.
}

/** Separate active users, pending claims and backing in raw stHYPE shares, excluding seed entitlement. */
function escrowClaims(accounting, seedUnits) {
  const [active, units, pending, rewards] = Array.from(accounting, BigInt);
  seedUnits = BigInt(seedUnits);
  if (seedUnits > units || (units === 0n && active !== 0n)) throw new Error('Invalid escrow ownership');
  const seed = units === 0n ? 0n : active * seedUnits / units;
  return { active: active - seed, claims: active - seed + pending, custody: active + pending + rewards, units, allActive: active };
}

/** Read block-pinned LP NAV/share, including lending and unstaking less withdrawal liabilities. */
async function readStex(api, address) {
  const [pool, module, supply, paused] = await api.batchCall([
    { target: address, abi: 'address:pool' },
    // This address can migrate; the SDK's address cache is not block-aware.
    { target: address, abi: 'address:withdrawalModule', skipCache: true },
    { target: address, abi: 'uint256:totalSupply' }, { target: address, abi: 'bool:paused' },
  ]);
  const [reserves, lending, unstaking, pending, claimable] = await api.batchCall([
    { target: pool, abi: 'function getReserves() view returns (uint256,uint256)' },
    ...['amountToken1LendingPool', 'amountToken0PendingUnstaking', 'amountToken1PendingLPWithdrawal', 'amountToken1ClaimableLPWithdrawal'].map(name => ({ target: module, abi: `uint256:${name}` })),
  ]);
  const native = BigInt(await api.getGasTokenBalance(module));
  const excess = native > BigInt(claimable) ? native - BigInt(claimable) : 0n;
  let surplus = 0n;
  if (excess > 0n) {
    const abi = module.toLowerCase() === ORIGINAL_MODULE ? 'uint256:_amountToken1PendingLPWithdrawal' : 'uint256:amountToken1PendingLPWithdrawalBeforeUpdate';
    const before = BigInt(await api.call({ target: module, abi }));
    surplus = excess > before ? excess - before : 0n;
  }
  const converted = BigInt(await api.call({ target: module, abi: 'function convertToToken1(uint256) view returns (uint256)', params: [(BigInt(reserves[0]) + BigInt(unstaking)).toString()] }));
  const assets = BigInt(reserves[1]) + BigInt(lending) + converted + surplus - BigInt(pending);
  if (assets < 0n) throw new Error('Negative STEX NAV');
  return { assets, index: { numerator: assets, denominator: BigInt(supply) }, paused };
}

/** Return each product's raw assets and yield index; restaking yield assets include active users only. */
async function readState(api, kind, config) {
  if (kind === 'sthype') {
    const [assets, rate] = await api.batchCall([
      { target: STHYPE, abi: 'uint256:totalSupply' },
      { target: STHYPE, abi: 'function sharesToBalance(uint256) view returns (uint256)', params: [RAW_SHARE] },
    ]);
    return { assets: BigInt(assets), index: { numerator: BigInt(rate), denominator: 10n ** 18n }, paused: false };
  }
  if (kind !== 'restaking') return readStex(api, config.address);
  const [accounting, seed, custody, rate, configView, paused] = await api.batchCall([
    { target: ESCROW, abi: 'function totalAccounting() view returns (uint256,uint256,uint256,uint256)' },
    { target: ESCROW, abi: 'function account(address) view returns (uint256,uint256,uint256)', params: [SEED] },
    { target: STHYPE, abi: 'function sharesOf(address) view returns (uint256)', params: [ESCROW] },
    { target: STHYPE, abi: 'function sharesToBalance(uint256) view returns (uint256)', params: [RAW_SHARE] },
    { target: ESCROW, abi: 'function configuration() view returns (address,address,address,uint64,uint64)' },
    { target: ESCROW, abi: 'bool:paused' },
  ]);
  const shares = escrowClaims(accounting, seed[0]);
  // Let the accounting view allocate recognized surplus; only a shortfall
  // invalidates backing. Never add unaccounted custody to active user assets.
  if (BigInt(custody) < shares.custody) throw new Error('Escrow custody does not reconcile');
  // The yield denominator is ACTIVE users only. Pending claims earn base
  // stHYPE yield, but not premiums, so must not dilute this pool's return.
  const assets = BigInt(await api.call({ target: STHYPE, abi: 'function sharesToBalance(uint256) view returns (uint256)', params: [shares.active.toString()] }));
  const index = { numerator: shares.allActive * BigInt(rate), denominator: shares.units };
  return { assets, index, paused, cooldown: Number(configView[3]), hasUsers: shares.active > 0n };
}

/** Require an explicit archive-only SDK pool and check every candidate before historical reads. */
async function archiveProvider() {
  // Match the SDK's environment precedence; never mutate shared RPC settings
  // from an adapter, or trust a whitelist applied after a provider was cached.
  const configured = process.env.LLAMA_SDK_HYPERLIQUID_WHITELISTED_RPC
    ?? process.env.SDK_HYPERLIQUID_WHITELISTED_RPC
    ?? process.env.HYPERLIQUID_WHITELISTED_RPC;
  const allowed = new Set((configured || '').split(',').map(url => url.trim()).filter(Boolean));
  if (!allowed.size) throw new Error('Valantis APY requires HYPERLIQUID_WHITELISTED_RPC configured with archive endpoints before SDK initialization');
  const provider = sdk.getProvider(chain);
  const candidates = [...(provider?.rpcs || []), ...(provider?.archivalRPCs || [])];
  if (!provider?.isCustomLlamaProvider || !provider.rpcs.length
    || candidates.some(rpc => !allowed.has(rpc.url.trim())))
    throw new Error('Valantis APY requires an archive-only SDK provider pool; cached or unapproved RPC fallback detected');
  const endpoints = new Map(candidates.map(rpc => [rpc.url, rpc.provider]));
  // The aggregate provider's inherited getCode can pick just one endpoint.
  // Probe each candidate directly so failover cannot hide a latest-only node.
  for (const endpoint of endpoints.values()) {
    let code;
    try {
      code = await endpoint.getCode(ESCROW, 1);
    } catch {
      throw new Error('Valantis APY could not validate a configured archive RPC');
    }
    if (code !== '0x') throw new Error('Valantis APY requires an archive RPC; historical code query returned current code');
  }
  return provider;
}

/** Resolve a deployed 24-hour window using one validated archive-only pool for blocks and state. */
async function context(timestamp, config) {
  const endTime = timestamp === undefined ? Math.floor(Date.now() / 1000) - 60 : Number(timestamp);
  if (!Number.isFinite(endTime) || endTime <= 86400) throw new Error('Invalid Valantis observation timestamp');
  const provider = await archiveProvider();
  const endBlock = await sdk.blocks.getBlockNumber(chain, endTime);
  const startBlock = await sdk.blocks.getBlockNumber(chain, endTime - 86400);
  if (startBlock < config.block) throw new Error('Insufficient deployed history for a 24-hour Valantis return');
  const end = await provider.getBlock(endBlock), start = await provider.getBlock(startBlock);
  if (!start || !end || end.timestamp <= start.timestamp) throw new Error('Missing Valantis observation blocks');
  const api = new sdk.ChainApi({ chain, block: endBlock, timestamp: end.timestamp });
  const fromApi = new sdk.ChainApi({ chain, block: startBlock, timestamp: start.timestamp });
  if (api.provider !== provider || fromApi.provider !== provider)
    throw new Error('Valantis archive provider changed while resolving the observation');
  return { api, fromApi, elapsed: end.timestamp - start.timestamp, timestamp: end.timestamp };
}

/** Build registered-product pool rows with separate indexes and a shared observation/price snapshot. */
function createAdapter(kinds) {
  kinds = Array.isArray(kinds) ? kinds : [kinds];
  if (!kinds.length || kinds.some(kind => !configs[kind])) throw new Error('Unknown Valantis product');
  const first = kinds.map(kind => configs[kind]).reduce((a, b) => a.block < b.block ? a : b);
  return {
    // Public wrappers supply the literal ID for their registered product slug.
    timetravel: true,
    url: first.url,
    /** Fetch realized net returns without adding unreleased premiums or duplicate intrinsic yield. */
    apy: async (timestamp) => {
      const ctx = await context(timestamp, first);
      const key = `${chain}:${WHYPE}`;
      const prices = await getPriceApiData(`/prices/historical/${ctx.timestamp}/${key}`);
      const price = prices.coins?.[key]?.price;
      if (!Number.isFinite(price) || price <= 0) throw new Error('Missing HYPE price for Valantis observation');
      const pools = [];
      for (const kind of kinds) {
        const config = configs[kind];
        // A combined product's earlier history must not query a later pool
        // before it has a deployed 24-hour baseline. Existing pools still fail
        // on unavailable/invalid state rather than returning partial results.
        if (ctx.fromApi.block < config.block) continue;
        const current = await readState(ctx.api, kind, config);
        if (current.assets === 0n) continue;
        const previous = await readState(ctx.fromApi, kind, config);
        if (kind === 'restaking' && (!current.hasUsers || !previous.hasUsers)) throw new Error('No active-user baseline for restaking APY');
        const apyBase = annualized(previous.index, current.index, ctx.elapsed);
        const tvlUsd = new BigNumber(current.assets.toString()).div('1e18').times(price).toNumber();
        if (!Number.isFinite(tvlUsd)) throw new Error('Invalid Valantis pool TVL');
        const result = {
          pool: `${config.address}-${chain}`, chain: 'Hyperliquid L1', project: config.project,
          symbol: config.symbol, token: kind === 'restaking' ? null : config.address,
          tvlUsd, apyBase, underlyingTokens: [WHYPE], url: config.url,
        };
        if (kind === 'sthype') {
          result.isIntrinsicSource = true;
          result.searchTokenOverride = STHYPE;
        } else if (kind === 'restaking') {
          result.underlyingTokens = [STHYPE];
          result.poolMeta = `Restaking; ${current.cooldown / 86400}-day withdrawal notice; active user TVL; realized base yield plus released premiums${current.paused ? '; paused' : ''}`;
        } else {
          result.pricePerShare = new BigNumber(current.index.numerator.toString()).div(current.index.denominator.toString()).toNumber();
          result.poolMeta = current.paused ? 'Withdrawal-only; new deposits and swaps paused' : 'STEX LP; net realized staking, lending and trading yield';
        }
        pools.push(result);
      }
      return pools;
    },
  };
}

module.exports = { annualized, escrowClaims, context, readState, createAdapter };
