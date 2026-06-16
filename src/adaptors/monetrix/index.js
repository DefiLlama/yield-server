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

// sUSDM is an ERC4626 vault: shares are 18-decimal, the asset (USDM) is 6-decimal
const ONE_SHARE = '1000000000000000000';
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const apy = async () => {
  const latest = await sdk.api.util.getLatestBlock(CHAIN);
  // trailing 7-day window, clamped to when yield started during the first week
  const cutoffTimestamp = Math.max(
    latest.timestamp - WINDOW_SECONDS,
    YIELD_START_TIMESTAMP
  );
  const past = await sdk.api.util.lookupBlock(cutoffTimestamp, {
    chain: CHAIN,
  });

  // APY from the sUSDM share-price (assets per share) growth over the window.
  // injectYield raises totalAssets while shares stay constant, so price-per-share
  // growth is exactly the return a staker earned — correctly time-weighted and
  // immune to deposits/withdrawals (which mint/burn shares pro-rata, leaving the
  // price unchanged). This avoids dividing cumulative yield by a TVL that grew
  // over the window.
  const [totalAssetsRes, ppsNowRes, ppsPastRes] = await Promise.all([
    sdk.api.abi.call({ target: SUSDM, chain: CHAIN, abi: 'uint256:totalAssets' }),
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

  // USDM has no price feed yet; it mints/redeems 1:1 against USDC, so price via USDC
  const { pricesByAddress } = await utils.getPrices([USDC], CHAIN);
  const usdcPrice = pricesByAddress[USDC.toLowerCase()] ?? 1;

  return [
    {
      pool: `${SUSDM}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'monetrix',
      symbol: 'USDM',
      tvlUsd: tvlUnderlying * usdcPrice,
      apyBase,
      underlyingTokens: [USDM],
      url: 'https://www.monetrix.xyz/',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.monetrix.xyz/',
};
