const sdk = require('@defillama/sdk');
const utils = require('../utils');
const BigNumber = require('bignumber.js');
const { ethers } = require('ethers');

const CHAIN = 'arbitrum';
const VAULT = '0x956bdd9c18b786b082fd50c52722d254f0cb6964';
const FEED = '0x4062c539d09a76d79e366f8c2a2e2f987ead1fe0';
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const URL = 'https://app.shiftprotocol.xyz/';
const DAY = 86400;
const WEEK = 7 * DAY;
const LAST_ENTRY =
  'function getLastTvlEntries(uint256 count) view returns (tuple(uint256 value, uint256 timestamp, uint256 supplySnapshot)[])';

// NAV and supply come from the same feed entry (USDC 6 decimals, shares 18).
// Posted fee dilution is included; points and unposted fees are excluded.
const sharePrice = (entry) =>
  (Number(entry.value) / Number(entry.supplySnapshot)) * 1e12;

const ltllpApy = async (timestamp = Math.floor(Date.now() / 1000)) => {
  timestamp = Number(timestamp);
  const blocks = await utils.getBlocksByTime(
    [timestamp, timestamp - WEEK],
    CHAIN
  );
  const [[now], [then]] = await Promise.all(
    blocks.map(
      async (block) =>
        (
          await sdk.api.abi.call({
            target: FEED,
            abi: LAST_ENTRY,
            params: [1],
            chain: CHAIN,
            block,
          })
        ).output
    )
  );
  if (!now || !then) throw new Error('ltLLP: missing feed observation');
  const current = sharePrice(now);
  const past = sharePrice(then);
  const elapsed = Number(now.timestamp) - Number(then.timestamp);
  const price = (await utils.getPrices([USDC], CHAIN)).pricesByAddress[USDC];
  if (
    ![current, past, elapsed, price].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('ltLLP: invalid feed observation or USDC price');
  const apyBase = ((current / past) ** ((365 * 86400) / elapsed) - 1) * 100;
  if (!Number.isFinite(apyBase)) throw new Error('ltLLP: non-finite APY');

  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: 'Arbitrum',
      project: 'shift-protocol',
      symbol: 'USDC',
      tvlUsd: (Number(now.value) / 1e6) * price,
      apyBase,
      pricePerShare: current,
      underlyingTokens: [USDC],
      token: VAULT,
      poolMeta: 'ltLLP',
      url: URL,
    },
  ];
};

// Deployed risexUSDC epochs are six hours; allow one hour of keeper delay.
const RISEX_MAX_AGE = 7 * 3600;
const findRisexPast = (history) => {
  if (!history.length) return;
  const latest = history[history.length - 1];
  const cutoff = Number(latest.timestamp ?? latest[2]) - WEEK;
  return [...history].reverse().find((row) => {
    const time = Number(row.timestamp ?? row[2]);
    return time > 0 && time <= cutoff;
  });
};
const risexSnapshot = (row) => {
  const price = new BigNumber(row.sharePrice ?? row[0]);
  const supply = new BigNumber(row.totalSupply ?? row[1]);
  const timestamp = Number(row.timestamp ?? row[2]);
  if (
    !price.isInteger() ||
    !price.gt(0) ||
    !supply.isInteger() ||
    !supply.gt(0) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    throw new Error('risexUSDC: invalid settled snapshot');
  }
  return { price, supply, timestamp };
};

const risexMetrics = (history, blockTimestamp, totalAssets, assetDecimals) => {
  if (!history.length) throw new Error('risexUSDC: no settled history');
  const current = risexSnapshot(history[history.length - 1]);
  const age = blockTimestamp - current.timestamp;
  if (!Number.isSafeInteger(blockTimestamp) || age < 0 || age > RISEX_MAX_AGE) {
    throw new Error('risexUSDC: stale or future settlement');
  }
  if (
    !Number.isInteger(assetDecimals) ||
    assetDecimals < 0 ||
    assetDecimals > 36
  ) {
    throw new Error('risexUSDC: invalid asset decimals');
  }
  const assets = new BigNumber(totalAssets);
  if (!assets.isInteger() || !assets.gt(0)) {
    throw new Error('risexUSDC: invalid total assets');
  }
  const past = findRisexPast(history);
  if (!past) throw new Error('risexUSDC: missing return history');
  const baseline = risexSnapshot(past);
  const elapsed = current.timestamp - baseline.timestamp;
  if (elapsed > WEEK + RISEX_MAX_AGE) {
    throw new Error('risexUSDC: stale return baseline');
  }
  // Settled PPS includes fee dilution. Supply changes do not create returns.
  const apyBase =
    Math.expm1(
      (Math.log(current.price.div(baseline.price).toNumber()) * 365 * DAY) /
        elapsed
    ) * 100;
  if (!Number.isFinite(apyBase)) throw new Error('risexUSDC: non-finite APY');
  const tvlUnderlying = assets.shiftedBy(-assetDecimals).toNumber();
  const pricePerShare = current.price.shiftedBy(-assetDecimals).toNumber();
  if (![tvlUnderlying, pricePerShare].every(Number.isFinite)) {
    throw new Error('risexUSDC: non-finite vault values');
  }
  return { apyBase, tvlUnderlying, pricePerShare, past };
};

const RISEX_PRICE_EVENT =
  'event SharePriceUpdated(uint256 epoch, uint256 sharePrice, uint256 previousSharePrice, uint256 totalSupply, uint256 timestamp)';
const risexInterface = new ethers.utils.Interface([
  'function epochSettle(uint256 sharePrice)',
  RISEX_PRICE_EVENT,
  'event PerformanceFeeCollected(uint256 epoch, uint256 sharePrice, uint256 previousHwm, uint256 feeSharesMinted)',
  'event MaintenanceFeeCollected(uint256 epoch, uint256 feeAssets, uint256 sharePriceBefore, uint256 sharePriceAfter)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const ZERO_ADDRESS = ethers.constants.AddressZero;

const verifyRisexSettlement = ({
  tx,
  receipt,
  vault,
  share,
  epoch,
  current,
  anchorBlock,
}) => {
  const fail = () => {
    throw new Error('risexUSDC: unverified NAV settlement');
  };
  const input = tx?.input ?? tx?.data;
  if (
    tx?.to?.toLowerCase() !== vault.toLowerCase() ||
    Number(receipt?.status) !== 1 ||
    !Number.isSafeInteger(Number(receipt.blockNumber)) ||
    Number(receipt.blockNumber) > anchorBlock ||
    typeof input !== 'string' ||
    input.length !== 74
  )
    fail();
  let proposal;
  try {
    proposal = risexInterface.decodeFunctionData('epochSettle', input)[0];
  } catch (e) {
    fail();
  }
  // An emergency zero proposal can refresh the snapshot timestamp without NAV.
  if (proposal.isZero()) fail();

  const events = [];
  let minted = ethers.BigNumber.from(0);
  for (const log of receipt.logs) {
    const address = log.address.toLowerCase();
    if (![vault.toLowerCase(), share.toLowerCase()].includes(address)) continue;
    let event;
    try {
      event = risexInterface.parseLog(log);
    } catch (e) {
      continue;
    }
    if (
      address === share.toLowerCase() &&
      event.name === 'Transfer' &&
      event.args.from === ZERO_ADDRESS
    ) {
      minted = minted.add(event.args.value);
    } else if (address === vault.toLowerCase()) {
      events.push(event);
    }
  }
  const prices = events.filter((e) => e.name === 'SharePriceUpdated');
  if (prices.length !== 1) fail();
  const observed = prices[0].args;
  if (
    !observed.epoch.eq(epoch) ||
    !observed.sharePrice.eq(current.sharePrice ?? current[0]) ||
    !observed.totalSupply.eq(current.totalSupply ?? current[1]) ||
    !observed.timestamp.eq(current.timestamp ?? current[2]) ||
    observed.totalSupply.lte(minted)
  )
    fail();
  const supplyBefore = observed.totalSupply.sub(minted);
  const performance = events.filter(
    (e) => e.name === 'PerformanceFeeCollected'
  );
  const maintenance = events.filter(
    (e) => e.name === 'MaintenanceFeeCollected'
  );
  if (performance.length > 1 || maintenance.length > 1) fail();
  if (performance.length) {
    const fee = performance[0].args;
    if (
      !fee.epoch.eq(epoch) ||
      !fee.sharePrice.eq(proposal) ||
      fee.feeSharesMinted.gt(minted)
    )
      fail();
    proposal = proposal
      .mul(supplyBefore)
      .div(supplyBefore.add(fee.feeSharesMinted));
  }
  if (maintenance.length) {
    const fee = maintenance[0].args;
    if (
      !fee.epoch.eq(epoch) ||
      !fee.sharePriceBefore.eq(proposal) ||
      fee.sharePriceAfter.gt(proposal)
    )
      fail();
    proposal = fee.sharePriceAfter;
  }
  // Reject a nonzero proposal ignored during allocator-active grace as well.
  if (!proposal.eq(observed.sharePrice)) fail();
};

const RISEX_CHAIN = 'ethereum';
const RISEX_VAULT = '0x5f70e536190c15e5959dbfef2f2632e540da74cd';
const RISEX_SHARE = '0xdbe599c184cc13d82f956fa5adaa1b18c0ff67d3';
const RISEX_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const RISEX_PERFORMANCE_ABI =
  'function latestPerformance() view returns (uint256 epoch, uint256 sharePrice, uint256 previousSharePrice, uint256 totalSupply, uint256 timestamp, uint256 hwm)';
const RISEX_HISTORY_ABI =
  'function getSharePriceHistory(uint256 fromEpoch, uint256 toEpoch) view returns (tuple(uint256 sharePrice, uint256 totalSupply, uint256 timestamp)[])';

const risexApy = async (timestamp) => {
  const anchor = timestamp
    ? await sdk.api.util.lookupBlock(Number(timestamp), { chain: RISEX_CHAIN })
    : await sdk.api.util.getLatestBlock(RISEX_CHAIN);
  const block = anchor.number ?? anchor.block;
  const call = async (abi, params = [], target = RISEX_VAULT) =>
    (await sdk.api.abi.call({ chain: RISEX_CHAIN, target, abi, params, block }))
      .output;
  const [
    asset,
    share,
    decimals,
    priceDecimals,
    performance,
    totalAssets,
    active,
    stale,
  ] = await Promise.all([
    call('address:asset'),
    call('address:share'),
    call('erc20:decimals', [], RISEX_USDC),
    call('uint8:sharePriceDecimals'),
    call(RISEX_PERFORMANCE_ABI),
    call('uint256:totalAssets'),
    call('bool:allocatorActive'),
    call('uint256:stalePriceEpochs'),
  ]);
  if (
    asset.toLowerCase() !== RISEX_USDC ||
    share.toLowerCase() !== RISEX_SHARE ||
    Number(priceDecimals) !== Number(decimals)
  ) {
    throw new Error(
      'risexUSDC: unexpected asset, receipt token or price decimals'
    );
  }
  if (active || Number(stale) > 1)
    throw new Error('risexUSDC: unavailable current valuation');
  const epoch = Number(performance.epoch ?? performance[0]);
  const settledAt = Number(performance.timestamp ?? performance[4]);
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    !Number.isSafeInteger(settledAt) ||
    settledAt <= 0 ||
    Number(anchor.timestamp) - settledAt > RISEX_MAX_AGE ||
    settledAt > Number(anchor.timestamp)
  ) {
    throw new Error('risexUSDC: stale or invalid latest settlement');
  }
  // Extend within the 720-entry ring buffer if catch-up settlements compress
  // the history. A full seven-day baseline is mandatory, measured by timestamp.
  let history;
  let fromEpoch;
  for (const count of [64, 128, 256, 512, 720]) {
    fromEpoch = Math.max(0, epoch - count + 1);
    history = await call(RISEX_HISTORY_ABI, [fromEpoch, epoch]);
    if (history.length !== epoch - fromEpoch + 1)
      throw new Error('risexUSDC: incomplete settled history');
    if (findRisexPast(history) || fromEpoch === 0) break;
  }
  const current = history[history.length - 1];
  if (
    String(current.sharePrice ?? current[0]) !==
      String(performance.sharePrice ?? performance[1]) ||
    Number(current.timestamp ?? current[2]) !== settledAt
  ) {
    throw new Error('risexUSDC: inconsistent settled history');
  }
  const result = risexMetrics(
    history,
    Number(anchor.timestamp),
    totalAssets,
    Number(decimals)
  );
  const provider = sdk.getProvider(RISEX_CHAIN);
  const verify = async (settledEpoch, row) => {
    const time = Number(row.timestamp ?? row[2]);
    // Timestamp-to-block lookup is approximate; bracket each endpoint by 1h.
    const [from, to] = await Promise.all([
      sdk.api.util.lookupBlock(time - 3600, { chain: RISEX_CHAIN }),
      time === settledAt
        ? anchor
        : sdk.api.util.lookupBlock(time + 3600, { chain: RISEX_CHAIN }),
    ]);
    if (Number(from.timestamp) >= time || Number(to.timestamp) < time)
      throw new Error('risexUSDC: invalid settlement log range');
    const logs = await sdk.getEventLogs({
      chain: RISEX_CHAIN,
      target: RISEX_VAULT,
      fromBlock: from.number ?? from.block,
      toBlock: Math.min(Number(to.number ?? to.block), Number(block)),
      eventAbi: RISEX_PRICE_EVENT,
      entireLog: true,
      skipIndexer: true,
      skipCache: true,
    });
    const matches = logs.filter((log) => {
      const event = risexInterface.parseLog(log).args;
      return event.epoch.eq(settledEpoch) && event.timestamp.eq(time);
    });
    if (matches.length !== 1)
      throw new Error('risexUSDC: missing settlement provenance');
    const hash = matches[0].transactionHash;
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(hash),
      provider.getTransactionReceipt(hash),
    ]);
    verifyRisexSettlement({
      tx,
      receipt,
      vault: RISEX_VAULT,
      share: RISEX_SHARE,
      epoch: settledEpoch,
      current: row,
      anchorBlock: Number(block),
    });
  };
  // Emergency or allocator-skipped settlements can reuse an old NAV while
  // refreshing its timestamp. Verify fresh proposals at both APY endpoints.
  await Promise.all([
    verify(epoch, current),
    verify(fromEpoch + history.indexOf(result.past), result.past),
  ]);

  const price = (await utils.getPrices([RISEX_USDC], RISEX_CHAIN))
    .pricesByAddress[RISEX_USDC];
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('risexUSDC: missing or invalid USDC/USD price');
  return [
    {
      pool: `${RISEX_VAULT}-${RISEX_CHAIN}`,
      chain: utils.formatChain(RISEX_CHAIN),
      project: 'shift-protocol',
      symbol: 'USDC',
      tvlUsd: result.tvlUnderlying * price,
      apyBase: result.apyBase,
      pricePerShare: result.pricePerShare,
      underlyingTokens: [RISEX_USDC],
      token: RISEX_SHARE,
      poolMeta: 'risexUSDC',
      url: 'https://app.shiftprotocol.xyz/',
    },
  ];
};

const apy = async (timestamp) => {
  const results = await Promise.allSettled([
    ltllpApy(timestamp),
    risexApy(timestamp),
  ]);
  return results.flatMap((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.error(
      `Shift ${['ltLLP', 'risexUSDC'][i]}: ${result.reason.message}`
    );
    return [];
  });
};

module.exports = { protocolId: '6901', timetravel: true, apy, url: URL };
