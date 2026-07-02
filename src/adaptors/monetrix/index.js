const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'hyperliquid';

const SUSDM = '0x5f1ab62C3159eBE04aFF14Beef84b0b60de63DDF';
const USDM = '0xE2d2959f89B6389DeB624bF076Fe7D9E5401f377';
const USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';

// Yield only began accruing once real user capital entered the vault at
// 2026-06-10 13:00 UTC; the deployment earlier that day held only negligible
// test funds. Anchoring the bootstrap window here (rather than the bare deploy
// time) keeps the pre-capital hours out of the annualization denominator. This
// clamp only affects the first 7 days — afterwards the window is a clean
// trailing 7 days and this constant is no longer used.
const YIELD_START_TIMESTAMP = 1781096400;
const WINDOW_SECONDS = 7 * 86400;
const SECONDS_PER_YEAR = 365 * 86400;

// sUSDM is an ERC4626 vault: shares are 12-decimal, the asset (USDM) is 6-decimal
const ONE_SHARE = '1000000000000';
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const apy = async () => {
  const latest = await sdk.api.util.getLatestBlock(CHAIN);
  // trailing 7-day window, clamped to when yield started during the first week
  const cutoffTimestamp = Math.max(
    latest.timestamp - WINDOW_SECONDS,
    YIELD_START_TIMESTAMP
  );
  // past = 7-day trailing cutoff; inception = the day yield first accrued
  const [past, inception] = await Promise.all([
    sdk.api.util.lookupBlock(cutoffTimestamp, { chain: CHAIN }),
    sdk.api.util.lookupBlock(YIELD_START_TIMESTAMP, { chain: CHAIN }),
  ]);

  // APY from the sUSDM share-price (assets per share) growth over the window.
  // injectYield raises totalAssets while shares stay constant, so price-per-share
  // growth is exactly the return a staker earned — correctly time-weighted and
  // immune to deposits/withdrawals (which mint/burn shares pro-rata, leaving the
  // price unchanged). This avoids dividing cumulative yield by a TVL that grew
  // over the window.
  const [totalAssetsRes, ppsNowRes, ppsPastRes, ppsInceptionRes] =
    await Promise.all([
      sdk.api.abi.call({
        target: SUSDM,
        chain: CHAIN,
        abi: 'uint256:totalAssets',
        block: latest.number,
      }),
      sdk.api.abi.call({
        target: SUSDM,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: latest.number,
      }),
      sdk.api.abi.call({
        target: SUSDM,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: past.block,
      }),
      sdk.api.abi.call({
        target: SUSDM,
        chain: CHAIN,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [ONE_SHARE],
        block: inception.block,
      }),
    ]);

  // USDM is 6 decimals
  const tvlUnderlying = Number(totalAssetsRes.output) / 1e6;

  const ppsNow = Number(ppsNowRes.output);
  const ppsPast = Number(ppsPastRes.output);
  const elapsed = Math.max(latest.timestamp - cutoffTimestamp, 86400);
  const apyBase =
    ppsPast > 0
      ? (Math.pow(ppsNow / ppsPast, SECONDS_PER_YEAR / elapsed) - 1) * 100
      : 0;

  // since-inception annualized return (from when yield first accrued)
  const ppsInception = Number(ppsInceptionRes.output);
  const elapsedInception = Math.max(
    latest.timestamp - YIELD_START_TIMESTAMP,
    86400
  );
  const apyBaseInception =
    ppsInception > 0
      ? (Math.pow(ppsNow / ppsInception, SECONDS_PER_YEAR / elapsedInception) -
          1) *
        100
      : 0;

  // convertToAssets(1 share) returns 6-decimal USDM per whole share
  const pricePerShare = ppsNow / 1e6;

  // USDM mints/redeems 1:1 against USDC. Prefer a real USDM feed once it exists,
  // and fall back to USDC (then 1) until USDM pricing is available.
  const { pricesByAddress } = await utils.getPrices([USDM, USDC], CHAIN);
  const usdmPrice =
    pricesByAddress[USDM.toLowerCase()] ??
    pricesByAddress[USDC.toLowerCase()] ??
    1;

  return [
    {
      pool: `${SUSDM.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'monetrix',
      symbol: 'USDM',
      tvlUsd: tvlUnderlying * usdmPrice,
      apyBase,
      apyBaseInception,
      pricePerShare,
      isIntrinsicSource: true,
      underlyingTokens: [USDM],
      url: 'https://www.monetrix.xyz/app/earn',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '8019',
  timetravel: false,
  apy,
  url: 'https://www.monetrix.xyz/',
};
