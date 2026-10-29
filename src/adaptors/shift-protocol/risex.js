const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { MAX_AGE, findPast, metrics } = require('./risex-metrics');
const { PRICE_EVENT, iface, verifySettlement } = require('./risex-settlement');

const CHAIN = 'ethereum';
const VAULT = '0x5f70e536190c15e5959dbfef2f2632e540da74cd';
const SHARE = '0xdbe599c184cc13d82f956fa5adaa1b18c0ff67d3';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const PERFORMANCE_ABI =
  'function latestPerformance() view returns (uint256 epoch, uint256 sharePrice, uint256 previousSharePrice, uint256 totalSupply, uint256 timestamp, uint256 hwm)';
const HISTORY_ABI =
  'function getSharePriceHistory(uint256 fromEpoch, uint256 toEpoch) view returns (tuple(uint256 sharePrice, uint256 totalSupply, uint256 timestamp)[])';

module.exports = async (timestamp) => {
  const anchor = timestamp
    ? await sdk.api.util.lookupBlock(Number(timestamp), { chain: CHAIN })
    : await sdk.api.util.getLatestBlock(CHAIN);
  const block = anchor.number ?? anchor.block;
  const call = async (abi, params = [], target = VAULT) =>
    (await sdk.api.abi.call({ chain: CHAIN, target, abi, params, block }))
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
    call('erc20:decimals', [], USDC),
    call('uint8:sharePriceDecimals'),
    call(PERFORMANCE_ABI),
    call('uint256:totalAssets'),
    call('bool:allocatorActive'),
    call('uint256:stalePriceEpochs'),
  ]);
  if (
    asset.toLowerCase() !== USDC ||
    share.toLowerCase() !== SHARE ||
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
    Number(anchor.timestamp) - settledAt > MAX_AGE ||
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
    history = await call(HISTORY_ABI, [fromEpoch, epoch]);
    if (history.length !== epoch - fromEpoch + 1)
      throw new Error('risexUSDC: incomplete settled history');
    if (findPast(history) || fromEpoch === 0) break;
  }
  const current = history[history.length - 1];
  if (
    String(current.sharePrice ?? current[0]) !==
      String(performance.sharePrice ?? performance[1]) ||
    Number(current.timestamp ?? current[2]) !== settledAt
  ) {
    throw new Error('risexUSDC: inconsistent settled history');
  }
  const result = metrics(
    history,
    Number(anchor.timestamp),
    totalAssets,
    Number(decimals)
  );
  const provider = sdk.getProvider(CHAIN);
  const verify = async (settledEpoch, row) => {
    const time = Number(row.timestamp ?? row[2]);
    // Timestamp-to-block lookup is approximate; bracket each endpoint by 1h.
    const [from, to] = await Promise.all([
      sdk.api.util.lookupBlock(time - 3600, { chain: CHAIN }),
      time === settledAt
        ? anchor
        : sdk.api.util.lookupBlock(time + 3600, { chain: CHAIN }),
    ]);
    if (Number(from.timestamp) >= time || Number(to.timestamp) < time)
      throw new Error('risexUSDC: invalid settlement log range');
    const logs = await sdk.getEventLogs({
      chain: CHAIN,
      target: VAULT,
      fromBlock: from.number ?? from.block,
      toBlock: Math.min(Number(to.number ?? to.block), Number(block)),
      eventAbi: PRICE_EVENT,
      entireLog: true,
      skipIndexer: true,
      skipCache: true,
    });
    const matches = logs.filter((log) => {
      const event = iface.parseLog(log).args;
      return event.epoch.eq(settledEpoch) && event.timestamp.eq(time);
    });
    if (matches.length !== 1)
      throw new Error('risexUSDC: missing settlement provenance');
    const hash = matches[0].transactionHash;
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(hash),
      provider.getTransactionReceipt(hash),
    ]);
    verifySettlement({
      tx,
      receipt,
      vault: VAULT,
      share: SHARE,
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

  const key = `${CHAIN}:${USDC}`;
  const path = timestamp
    ? `/prices/historical/${anchor.timestamp}/${key}`
    : `/prices/current/${key}`;
  const price = (await utils.getPriceApiData(path)).coins?.[key];
  if (
    !Number.isFinite(price?.price) ||
    price.price <= 0 ||
    !Number.isFinite(price.timestamp) ||
    Math.abs(Number(anchor.timestamp) - price.timestamp) > 3600
  ) {
    throw new Error('risexUSDC: missing or stale USDC/USD price');
  }
  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'shift-protocol',
      symbol: 'USDC',
      tvlUsd: result.tvlUnderlying * price.price,
      apyBase: result.apyBase,
      pricePerShare: result.pricePerShare,
      underlyingTokens: [USDC],
      token: SHARE,
      poolMeta: 'risexUSDC',
      url: 'https://app.shiftprotocol.xyz/',
    },
  ];
};
