const sdk = require('@defillama/sdk');
const utils = require('../utils');
const risexApy = require('./risex');

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
