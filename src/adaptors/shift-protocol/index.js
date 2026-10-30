const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'arbitrum';
const VAULT = '0x956bdd9c18b786b082fd50c52722d254f0cb6964';
const FEED = '0x4062c539d09a76d79e366f8c2a2e2f987ead1fe0';
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const URL = 'https://app.shiftprotocol.xyz/';
const WEEK = 7 * 86400;
const LAST_ENTRY =
  'function getLastTvlEntries(uint256 count) view returns (tuple(uint256 value, uint256 timestamp, uint256 supplySnapshot)[])';

// NAV and supply come from the same feed entry (USDC 6 decimals, shares 18).
// Posted fee dilution is included; points and unposted fees are excluded.
const sharePrice = (entry) =>
  (Number(entry.value) / Number(entry.supplySnapshot)) * 1e12;

const apy = async (timestamp = Math.floor(Date.now() / 1000)) => {
  timestamp = Number(timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
    throw new Error('ltLLP: invalid requested timestamp');
  const blocks = await utils.getBlocksByTime(
    [timestamp, timestamp - WEEK],
    CHAIN
  );
  if (
    blocks.length !== 2 ||
    !blocks.every((block) => Number.isSafeInteger(block) && block > 0)
  )
    throw new Error('ltLLP: missing or invalid block height');
  const [[now], [then], { output: freshness }] = await Promise.all([
    ...blocks.map(
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
    ),
    sdk.api.abi.call({
      target: VAULT,
      abi: 'uint16:freshness',
      chain: CHAIN,
      block: blocks[0],
    }),
  ]);
  if (!now || !then) throw new Error('ltLLP: missing feed observation');
  const maxAge = Number(freshness);
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0)
    throw new Error('ltLLP: invalid feed freshness limit');
  // Check each observation against its requested time, including time travel.
  for (const [entry, requestedAt] of [
    [now, timestamp],
    [then, timestamp - WEEK],
  ]) {
    const observedAt = Number(entry.timestamp);
    const age = requestedAt - observedAt;
    if (
      !Number.isSafeInteger(observedAt) ||
      observedAt <= 0 ||
      age < 0 ||
      age > maxAge
    )
      throw new Error('ltLLP: stale or future feed observation');
  }
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

module.exports = { protocolId: '6901', timetravel: true, apy, url: URL };
