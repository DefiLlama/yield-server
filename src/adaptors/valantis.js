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
  sthype: { project: 'valantis-sthype', address: STHYPE, block: 25412, symbol: 'stHYPE', url: 'https://app.valantis.xyz/vaults' },
  sthypeStex: { project: 'valantis-sthype-stex', address: '0x39694eff3b02248929120c73f90347013aec834d', block: 1937868, symbol: 'stHYPE-HYPE', url: 'https://app.valantis.xyz/vaults' },
  khypeStex: { project: 'valantis-khype-stex', address: '0xbf747d2959f03332dbd25249db6f00f62c6cb526', block: 7773262, symbol: 'kHYPE-HYPE', url: 'https://app.valantis.xyz/vaults' },
  restaking: { project: 'valantis-sthype-restaking', address: ESCROW, block: 47206861, symbol: 'stHYPE', url: 'https://app.valantis.xyz/restaking' },
};

function annualized(before, after, elapsed) {
  if (elapsed <= 0 || before.numerator <= 0n || before.denominator <= 0n || after.numerator <= 0n || after.denominator <= 0n)
    throw new Error('Valantis APY requires positive exchange rates and elapsed time');
  const change = new BigNumber((after.numerator * before.denominator).toString())
    .div((before.numerator * after.denominator).toString()).minus(1).toNumber();
  const result = Math.expm1(Math.log1p(change) * 31536000 / elapsed) * 100;
  if (!Number.isFinite(result)) throw new Error('Valantis annualized return is not finite');
  return result; // Preserve genuine zero and negative realized returns.
}

function escrowClaims(accounting, seedUnits) {
  const [active, units, pending, rewards] = Array.from(accounting, BigInt);
  seedUnits = BigInt(seedUnits);
  if (seedUnits > units || (units === 0n && active !== 0n)) throw new Error('Invalid escrow ownership');
  const seed = units === 0n ? 0n : active * seedUnits / units;
  return { active: active - seed, claims: active - seed + pending, custody: active + pending + rewards, units, allActive: active };
}

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
  if (shares.custody !== BigInt(custody)) throw new Error('Escrow custody does not reconcile');
  // The yield denominator is ACTIVE users only. Pending claims earn base
  // stHYPE yield, but not premiums, so must not dilute this pool's return.
  const assets = BigInt(await api.call({ target: STHYPE, abi: 'function sharesToBalance(uint256) view returns (uint256)', params: [shares.active.toString()] }));
  const index = { numerator: shares.allActive * BigInt(rate), denominator: shares.units };
  return { assets, index, paused, cooldown: Number(configView[3]), hasUsers: shares.active > 0n };
}

async function context(timestamp, config) {
  const endTime = timestamp === undefined ? Math.floor(Date.now() / 1000) - 60 : Number(timestamp);
  if (!Number.isFinite(endTime) || endTime <= 86400) throw new Error('Invalid Valantis observation timestamp');
  const provider = sdk.getProvider(chain);
  // The official latest-only RPC silently ignores historical block tags.
  // This known predeployment code check must not return today's proxy code.
  if (await provider.getCode(ESCROW, 1) !== '0x') throw new Error('Valantis APY requires an archive RPC; historical code query returned current code');
  const endBlock = await sdk.blocks.getBlockNumber(chain, endTime);
  const startBlock = await sdk.blocks.getBlockNumber(chain, endTime - 86400);
  if (startBlock < config.block) throw new Error('Insufficient deployed history for a 24-hour Valantis return');
  const end = await provider.getBlock(endBlock), start = await provider.getBlock(startBlock);
  if (!start || !end || end.timestamp <= start.timestamp) throw new Error('Missing Valantis observation blocks');
  const api = new sdk.ChainApi({ chain, block: endBlock, timestamp: end.timestamp });
  const fromApi = new sdk.ChainApi({ chain, block: startBlock, timestamp: start.timestamp });
  return { api, fromApi, elapsed: end.timestamp - start.timestamp, timestamp: end.timestamp };
}

function createAdapter(kind) {
  const config = configs[kind];
  if (!config) throw new Error('Unknown Valantis product');
  return {
    // protocolId must be assigned to this NEW product slug during listing.
    // Deliberately do not reuse an unrelated/combined listing's registered ID.
    timetravel: true,
    url: config.url,
    apy: async (timestamp) => {
      const ctx = await context(timestamp, config);
      const current = await readState(ctx.api, kind, config);
      if (current.assets === 0n) return [];
      const previous = await readState(ctx.fromApi, kind, config);
      if (kind === 'restaking' && (!current.hasUsers || !previous.hasUsers)) throw new Error('No active-user baseline for restaking APY');
      const apyBase = annualized(previous.index, current.index, ctx.elapsed);
      const key = `${chain}:${WHYPE}`;
      const prices = await getPriceApiData(`/prices/historical/${ctx.timestamp}/${key}`);
      const price = prices.coins?.[key]?.price;
      if (!Number.isFinite(price) || price <= 0) throw new Error('Missing HYPE price for Valantis observation');
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
      return [result];
    },
  };
}

module.exports = { annualized, escrowClaims, context, readState, createAdapter };
