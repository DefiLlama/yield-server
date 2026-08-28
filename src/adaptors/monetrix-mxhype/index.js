const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'hyperliquid';

const SMXHYPE = '0xf6B61A1d49B67aC907d825F26e2877F1Ec4f0aE8';
const MXHYPE = '0x0fAfAD2825aa646fDf343A0786D0dC1A842543b6';
const WHYPE = '0x5555555555555555555555555555555555555555';

// First production smxHYPE stake: 2026-08-17 10:12:20 UTC (block 43,417,195).
// Anchoring here keeps the pre-capital hours out of the annualization
// denominator; the clamp only matters for the first 7 days.
const YIELD_START_TIMESTAMP = 1786961540;
const WINDOW_SECONDS = 7 * 86400;
const SECONDS_PER_YEAR = 365 * 86400;

// smxHYPE is an ERC4626 vault: shares are 24-decimal, the asset (mxHYPE) is 18-decimal
const ONE_SHARE = '1000000000000000000000000';
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const apy = async (timestamp = null) => {
  // Anchor at the requested historical timestamp (timetravel/backfill) or at
  // the chain head for live runs. All reads below are pinned to this anchor.
  let anchor;
  if (timestamp) {
    // no pool data before real capital entered the vault
    if (timestamp <= YIELD_START_TIMESTAMP) return [];
    const at = await sdk.api.util.lookupBlock(timestamp, { chain: CHAIN });
    anchor = { number: at.block, timestamp: at.timestamp };
  } else {
    const latest = await sdk.api.util.getLatestBlock(CHAIN);
    anchor = { number: latest.number, timestamp: latest.timestamp };
  }
  // trailing 7-day window, clamped to when yield started during the first week
  const cutoffTimestamp = Math.max(
    anchor.timestamp - WINDOW_SECONDS,
    YIELD_START_TIMESTAMP
  );
  // past = 7-day trailing cutoff; inception = the day yield first accrued
  const [past, inception] = await Promise.all([
    sdk.api.util.lookupBlock(cutoffTimestamp, { chain: CHAIN }),
    sdk.api.util.lookupBlock(YIELD_START_TIMESTAMP, { chain: CHAIN }),
  ]);

  // APY from the smxHYPE share-price (assets per share) growth over the window.
  // injectYield raises totalAssets while shares stay constant, so price-per-share
  // growth is exactly the return a staker earned — correctly time-weighted and
  // immune to deposits/withdrawals (which mint/burn shares pro-rata, leaving the
  // price unchanged). Both sides of the ratio are denominated in mxHYPE, so the
  // resulting APY is a HYPE-denominated return and carries no HYPE price move.
  const [totalAssetsRes, ppsNowRes, ppsPastRes, ppsInceptionRes] =
    await Promise.all([
      sdk.api.abi.call({
        target: SMXHYPE,
        chain: CHAIN,
        abi: 'uint256:totalAssets',
        block: anchor.number,
      }),
      sdk.api.abi.call({
        target: SMXHYPE,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: anchor.number,
      }),
      sdk.api.abi.call({
        target: SMXHYPE,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: past.block,
      }),
      sdk.api.abi.call({
        target: SMXHYPE,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: inception.block,
      }),
    ]);

  // mxHYPE is 18 decimals
  const tvlUnderlying = Number(totalAssetsRes.output) / 1e18;

  const ppsNow = Number(ppsNowRes.output);
  const ppsPast = Number(ppsPastRes.output);
  const elapsed = Math.max(anchor.timestamp - cutoffTimestamp, 86400);
  const apyBase =
    ppsPast > 0
      ? (Math.pow(ppsNow / ppsPast, SECONDS_PER_YEAR / elapsed) - 1) * 100
      : 0;

  // since-inception annualized return (from when yield first accrued)
  const ppsInception = Number(ppsInceptionRes.output);
  const elapsedInception = Math.max(
    anchor.timestamp - YIELD_START_TIMESTAMP,
    86400
  );
  const apyBaseInception =
    ppsInception > 0
      ? (Math.pow(ppsNow / ppsInception, SECONDS_PER_YEAR / elapsedInception) -
          1) *
        100
      : 0;

  // convertToAssets(1 share) returns 18-decimal mxHYPE per whole share
  const pricePerShare = ppsNow / 1e18;

  // mxHYPE is redeemable 1:1 for native HYPE, so the row is valued with
  // DefiLlama's WHYPE price. Backfill runs price at the anchor timestamp
  // rather than at "now". Only tvlUsd uses the price — apyBase above stays
  // HYPE-denominated.
  const priceKey = `${CHAIN}:${WHYPE.toLowerCase()}`;
  const pricePath = timestamp
    ? `/prices/historical/${anchor.timestamp}/${priceKey}`
    : `/prices/current/${priceKey}`;
  const { coins } = await utils.getPriceApiData(pricePath);
  const hypePrice = coins[priceKey]?.price;

  return [
    {
      pool: `${SMXHYPE.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'monetrix-mxhype',
      // the pool is the smxHYPE staking vault (deposit mxHYPE, receive smxHYPE)
      symbol: 'smxHYPE',
      tvlUsd: tvlUnderlying * hypePrice,
      apyBase,
      apyBaseInception,
      pricePerShare,
      isIntrinsicSource: true,
      underlyingTokens: [MXHYPE],
      url: 'https://www.monetrix.xyz/app/earn?product=mxhype',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '8519',
  timetravel: true,
  apy,
  url: 'https://www.monetrix.xyz/',
};
