const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

const ITRY = '0xb492B4aFD9658093694CF9452D5C272e8230F3B0';
const WITRY = '0xE346C29b5B60Ef870b9724c57ccfbBc631e47DEE';

const LOOKBACK_DAYS = 7;
const SCAN_DAYS = 21;
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;
const ONE_WITRY = '1000000000000000000';

const abiConvertToAssets =
  'function convertToAssets(uint256 shares) view returns (uint256)';
const abiTotalAssets = 'uint256:totalAssets';
const abiGetVestingPeriod = 'function getVestingPeriod() view returns (uint256)';
const eventRewardsReceived = 'event RewardsReceived(uint256 amount)';

async function getRateAtBlock(block) {
  const { output } = await sdk.api.abi.call({
    target: WITRY,
    abi: abiConvertToAssets,
    params: [ONE_WITRY],
    chain: 'ethereum',
    block,
  });
  return Number(output) / 1e18;
}

// Distribution-anchored APY.
//
// Both endpoints of the lookback are anchored to actual on-chain
// RewardsReceived events. When no distribution arrives (Turkish holidays,
// weekends, bayrams) both anchors freeze → APY stays flat. The catch-up
// distribution at the end of a gap is absorbed symmetrically by both
// anchors → no spike.
//
// Vesting-aware sampling: wiTRY follows the Ethena V2 pattern where
// RewardsReceived adds to vestingAmount and unlocks linearly over
// getVestingPeriod() seconds (currently 1h). totalAssets() subtracts the
// unvested amount, so convertToAssets() at the event's own block reflects
// the pre-distribution state. To capture the distribution's effect we
// sample the rate at event.ts + vestingPeriod (clamped to latest block).
const apy = async () => {
  const latest = await sdk.api.util.getLatestBlock('ethereum');

  // Query vestingPeriod from the contract — don't hardcode. Wired up
  // because the VestingPeriodUpdated admin event implies this is mutable.
  const { output: vestingPeriodRaw } = await sdk.api.abi.call({
    target: WITRY,
    abi: abiGetVestingPeriod,
    chain: 'ethereum',
  });
  const vestingPeriod = Number(vestingPeriodRaw);

  const fromTs = latest.timestamp - SCAN_DAYS * SECONDS_PER_DAY;
  const { block: fromBlock } = await sdk.api.util.lookupBlock(fromTs, {
    chain: 'ethereum',
  });

  // Pull every distribution event in the scan window.
  const rawLogs = await sdk.getEventLogs({
    target: WITRY,
    eventAbi: eventRewardsReceived,
    fromBlock,
    toBlock: latest.number,
    chain: 'ethereum',
  });

  // Each log needs a timestamp — fetch in parallel.
  const events = await Promise.all(
    rawLogs.map(async (l) => {
      const ts = await sdk.api.util.getTimestamp(l.blockNumber, 'ethereum');
      return { block: l.blockNumber, ts };
    }),
  );
  events.sort((a, b) => a.ts - b.ts);

  // Anchor selection. With <2 events we can't compute a meaningful
  // 7-day rate (early launch days). Leave apyBase as null so the value
  // is not ingested into the DefiLlama time-series — a 0 would be read
  // as "APY was 0%" and skew downstream smoothing / averages.
  let apyBase = null;
  if (events.length >= 2) {
    const endEvent = events[events.length - 1];
    const startTarget = endEvent.ts - LOOKBACK_DAYS * SECONDS_PER_DAY;
    let startEvent = events[0];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].ts <= startTarget) {
        startEvent = events[i];
        break;
      }
    }

    // Sample rates at (event.ts + vestingPeriod) so the distribution
    // emitted by each anchor event is fully reflected in convertToAssets.
    // Clamp end to the latest block so we never query the future.
    const endSampleTs = Math.min(latest.timestamp, endEvent.ts + vestingPeriod);
    const startSampleTs = startEvent.ts + vestingPeriod;
    const [{ block: endBlock }, { block: startBlock }] = await Promise.all([
      sdk.api.util.lookupBlock(endSampleTs, { chain: 'ethereum' }),
      sdk.api.util.lookupBlock(startSampleTs, { chain: 'ethereum' }),
    ]);

    const rateEnd = await getRateAtBlock(endBlock);
    const rateStart = await getRateAtBlock(startBlock);
    const elapsedDays = (endSampleTs - startSampleTs) / SECONDS_PER_DAY;

    // convertToAssets growth is already net of the 10% performance fee —
    // YieldForwarder deducts it before streaming iTRY into the vault.
    if (elapsedDays > 0 && rateStart > 0) {
      const ratioReturn = rateEnd / rateStart - 1;
      apyBase =
        (Math.pow(1 + ratioReturn, DAYS_PER_YEAR / elapsedDays) - 1) * 100;
    }
  }

  const { output: totalAssetsRaw } = await sdk.api.abi.call({
    target: WITRY,
    abi: abiTotalAssets,
    chain: 'ethereum',
  });
  const priceKey = `ethereum:${ITRY}`;
  const priceResp = await axios.get(
    getPriceApiUrl(`/prices/current/${priceKey}`),
  );
  const iTryPrice = priceResp.data.coins[priceKey]?.price ?? 0;
  const tvlUsd = (Number(totalAssetsRaw) / 1e18) * iTryPrice;

  // Current pricePerShare for the ERC-4626 vault: 1 wiTRY → N iTRY at the
  // latest block. Sampled live (not from the APY anchors) so the UI always
  // shows the current redemption rate.
  const pricePerShare = await getRateAtBlock(latest.number);

  return [
    {
      pool: `${WITRY.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'brix',
      symbol: 'wiTRY',
      tvlUsd,
      apyBase,
      underlyingTokens: [ITRY],
      pricePerShare,
      isIntrinsicSource: true,
      poolMeta: 'APY · distribution-anchored 7d',
      url: 'https://app.brix.money',
    },
  ];
};

module.exports = {
  protocolId: '7967',
  timetravel: false,
  apy,
  url: 'https://app.brix.money',
};
