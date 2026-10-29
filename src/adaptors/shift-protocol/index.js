const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { DAY, metrics } = require('./metrics');
const getHistory = require('./history');

const CHAIN = 'arbitrum';
const VAULT = '0x956bdd9c18b786b082fd50c52722d254f0cb6964';
const FEED = '0x4062c539d09a76d79e366f8c2a2e2f987ead1fe0';
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const URL = 'https://app.shiftprotocol.xyz/';
const WEEK = 7 * DAY;

// ltLLP v1 is a bespoke ERC-20 vault, not ERC-4626. Its on-chain feed records
// NAV and matching share supply on every update. APY is the observed change
// in that share value over ~7d, annualized using the actual elapsed time.
// Fee-share dilution is included when reflected in a feed's supplySnapshot;
// pending, unclaimed fees are not accrued here. No additional fee haircut:
// that would double-count dilution already reflected in posted share values.
// Points and separately distributed rewards are excluded.
const apy = async (timestamp) => {
  const anchor = timestamp
    ? await sdk.api.util.lookupBlock(Number(timestamp), { chain: CHAIN })
    : await sdk.api.util.getLatestBlock(CHAIN);
  const block = anchor.number ?? anchor.block;
  const call = async (target, abi, params = []) =>
    (await sdk.api.abi.call({ target, abi, params, chain: CHAIN, block }))
      .output;

  const [asset, feed, freshness, assetDecimals, shareDecimals] =
    await Promise.all([
      call(VAULT, 'address:baseToken'),
      call(VAULT, 'address:tvlFeed'),
      call(VAULT, 'uint16:freshness'),
      call(USDC, 'erc20:decimals'),
      call(VAULT, 'erc20:decimals'),
    ]);
  if (asset.toLowerCase() !== USDC || feed.toLowerCase() !== FEED) {
    throw new Error('ltLLP: unexpected base token or TVL feed');
  }

  const entries = await getHistory(call, FEED, WEEK);
  const { apyBase, tvlUnderlying, pricePerShare } = metrics(
    entries,
    Number(anchor.timestamp),
    Number(freshness),
    Number(assetDecimals),
    Number(shareDecimals),
    WEEK
  );

  const priceKey = `${CHAIN}:${USDC}`;
  const path = timestamp
    ? `/prices/historical/${anchor.timestamp}/${priceKey}`
    : `/prices/current/${priceKey}`;
  const price = (await utils.getPriceApiData(path)).coins?.[priceKey];
  if (
    !Number.isFinite(price?.price) ||
    price.price <= 0 ||
    !Number.isFinite(price.timestamp) ||
    Math.abs(Number(anchor.timestamp) - price.timestamp) > 3600
  ) {
    throw new Error('ltLLP: missing or stale USDC/USD price');
  }

  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'shift-protocol',
      symbol: 'USDC',
      tvlUsd: tvlUnderlying * price.price,
      apyBase,
      pricePerShare,
      underlyingTokens: [USDC],
      token: VAULT,
      poolMeta: 'ltLLP',
      url: URL,
    },
  ];
};

module.exports = { protocolId: '6901', timetravel: true, apy, url: URL };
