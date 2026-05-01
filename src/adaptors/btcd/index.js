/**
 * @file BTCD yield-server adapter — exposes the sBTCD staking vault as a
 *       single Ethereum pool with TVL and 30-day APR.
 *
 * @description
 * BTCD is a synthetic basket-backed token (~50% BTC / ~50% USD) RFQ-minted
 * via BTCDMinting against whitelisted collateral. sBTCD is the protocol's
 * ERC-4626 staking vault: deposit BTCD, receive sBTCD shares, share price
 * grows as the YieldDistributor pushes freshly-minted BTCD into the vault
 * over 8h linear vesting cycles. A 7-day Silo cooldown gates withdrawals.
 */

const sdk = require('@defillama/sdk');
const axios = require('axios');

/** @type {string} DefiLlama chain slug. */
const CHAIN = 'ethereum';
/** @type {string} BTCD token (the underlying ERC-20). */
const BTCD = '0xC6694e05B750015f54Ac646544a4a9D33cbe4086';
/** @type {string} sBTCD ERC-4626 staking vault (the receipt token). */
const SBTCD = '0x3BC801419479865B24b4d32faB0Bf64638Abbd5f';
/**
 * @type {string} SBTCDOracle — Chainlink-compatible IPriceOracle returning
 *                sBTCD/USD with 8 decimals via `latestRoundData()`.
 */
const SBTCD_ORACLE = '0x332ebF042a7B7D87A8a2628186f8A5B12d8a6d94';

/**
 * APR methodology mirrors the protocol's canonical sBTCD rate-of-return
 * calculator at `services/vault/sbtcdror/sbtcdrorcalculator.go`:
 *   - 30-day lookback window
 *   - `previewRedeem(1e18)` for share-price reads (matches the canonical Go)
 *   - Simple APR (not compound APY) with a 365.25-day year
 *   - Clamp the start block to `SBTCDYieldTurnedOnBlock` so share prices
 *     from before yield activation are never sampled
 */

/** @type {string} 1e18 in raw token units; the standard ERC-4626 share unit. */
const WAD = '1000000000000000000';
/** @type {bigint} BigInt mirror of WAD, used for ratio scaling. */
const SCALE = 10n ** 18n;
/** @type {number} */
const SECONDS_PER_DAY = 86400;
/** @type {number} APR lookback window. Matches the canonical Go calculator. */
const LOOKBACK_DAYS = 30;
/** @type {number} 365.25 × 86400 — leap-year-aware seconds per year. */
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
/**
 * @type {number} Block at which the YieldDistributor first delivered yield
 *                to sBTCD. Sourced from
 *                `services/vault/monitor/setpointprovider` (see the
 *                `keySBTCDYieldTurnedOnBlock` default).
 */
const SBTCD_YIELD_TURNED_ON_BLOCK = 24450207;

/** @type {string} Human-readable ABI for `IERC4626.previewRedeem`. */
const previewRedeemAbi =
  'function previewRedeem(uint256 shares) view returns (uint256)';
/** @type {string} Human-readable ABI for `IPriceOracle.latestRoundData`. */
const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

/**
 * Resolves a chain block height for a given Unix timestamp using DefiLlama's
 * timestamp→block index. Returns the block whose timestamp is closest to the
 * requested second.
 *
 * @param {string} chain DefiLlama chain slug (e.g. `'ethereum'`).
 * @param {number} timestamp Unix seconds.
 * @returns {Promise<number>} The block height at (or nearest to) `timestamp`.
 * @throws {Error} If the HTTP request fails or the response is malformed.
 */
const getBlockAtTimestamp = async (chain, timestamp) =>
  (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`)).data
    .height;

/**
 * Computes the 30-day simple APR of the sBTCD vault from share-price growth.
 *
 * Reads `previewRedeem(1e18)` at the latest block and at a block 30 days ago,
 * computes the percentage increase, and annualises with a 365.25-day year:
 *
 *     APR = (priceNow / priceStart − 1) × secondsPerYear / secondsElapsed
 *
 * Mirrors `SBTCDRORCalculator.annualizeRate` in
 * `services/vault/sbtcdror/sbtcdrorcalculator.go`. Returns 0 (instead of
 * throwing) when the historical block is unavailable, predates yield
 * activation, or the share price did not grow — so a young vault still
 * publishes 0% APR alongside a valid TVL rather than failing the whole
 * adapter run.
 *
 * @returns {Promise<number>} APR as a percentage (e.g. `17.22` for 17.22%).
 *                            Always non-negative; returns 0 on any error or
 *                            non-positive growth.
 */
async function computeApyBase() {
  const nowTs = Math.floor(Date.now() / 1000);
  const oldTs = nowTs - LOOKBACK_DAYS * SECONDS_PER_DAY;
  let oldBlock;
  try {
    oldBlock = await getBlockAtTimestamp(CHAIN, oldTs);
  } catch (e) {
    return 0;
  }
  // If the lookback window starts before yield was turned on, the resulting
  // rate would be meaningless. The canonical calculator clamps to the
  // activation block; we just bail since the vault is < 30 days post-activation
  // only briefly and a 0% read is a clearer signal than a partial-window APR.
  if (oldBlock < SBTCD_YIELD_TURNED_ON_BLOCK) return 0;
  let nowVal, oldVal;
  try {
    const [nowRes, oldRes] = await Promise.all([
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [WAD],
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [WAD],
        block: oldBlock,
      }),
    ]);
    nowVal = BigInt(nowRes.output);
    oldVal = BigInt(oldRes.output);
  } catch (e) {
    return 0;
  }
  if (oldVal <= 0n || nowVal <= oldVal) return 0;
  // Simple APR:
  //   rate = (priceNow / priceStart - 1) × secondsPerYear / secondsElapsed
  const rateScaled = ((nowVal - oldVal) * SCALE) / oldVal; // (ratio − 1) × 1e18
  const rate = Number(rateScaled) / 1e18;
  if (!isFinite(rate) || rate <= 0) return 0;
  const secondsElapsed = nowTs - oldTs; // = LOOKBACK_DAYS × SECONDS_PER_DAY
  return ((rate * SECONDS_PER_YEAR) / secondsElapsed) * 100;
}

/**
 * Adapter entry point — produces DefiLlama yield-server pool entries for sBTCD.
 *
 * Reads `sBTCD.totalSupply()`, `SBTCDOracle.latestRoundData()`, and
 * computes APR in parallel. TVL is `totalSupply × oracleAnswer / 10^26`,
 * where the oracle answer is sBTCD/USD with 8 decimals (sBTCD has 18).
 *
 * @returns {Promise<Array<{
 *   pool: string,
 *   chain: string,
 *   project: string,
 *   symbol: string,
 *   tvlUsd: number,
 *   apyBase: number,
 *   underlyingTokens: string[],
 *   poolMeta: string,
 *   url: string,
 *   token: string,
 * }>>} Single-element array containing the sBTCD pool entry.
 * @throws {Error} If `SBTCDOracle.latestRoundData().answer` is non-positive.
 *                 (Morpho's IOracle spec returns 0 on bad feed data instead
 *                 of reverting; the int256 return type also technically
 *                 permits a negative answer. We surface either as a hard
 *                 error rather than silently publishing zero or negative TVL.)
 */
const apy = async () => {
  const [totalSupplyRes, oracleRes, apyBase] = await Promise.all([
    sdk.api.abi.call({ chain: CHAIN, target: SBTCD, abi: 'erc20:totalSupply' }),
    sdk.api.abi.call({
      chain: CHAIN,
      target: SBTCD_ORACLE,
      abi: latestRoundDataAbi,
    }),
    computeApyBase(),
  ]);

  const totalSupply = BigInt(totalSupplyRes.output); // 18 decimals
  const priceUsd_e8 = BigInt(oracleRes.output.answer); // 8 decimals (int256)
  // SBTCDOracle returns 0 on bad feed data per Morpho non-revert spec, and
  // the int256 return type technically permits a negative answer. Surface
  // either as a hard error rather than silently publishing 0 or negative TVL.
  if (priceUsd_e8 <= 0n) {
    throw new Error(
      `SBTCDOracle.latestRoundData().answer must be positive, got ${priceUsd_e8}`
    );
  }
  // tvlUsd = totalSupply × price / 10^(18+8) = USD raw with 8 decimals
  // (the oracle's `decimals()` is fixed at 8 per IPriceOracle).
  // Split the BigInt into whole+fractional dollars so we don't lose cents
  // of precision once total TVL grows past Number.MAX_SAFE_INTEGER (~$90M
  // when expressed at 8-decimal scale).
  const tvlUsdScaled = (totalSupply * priceUsd_e8) / 10n ** 18n; // 8-decimal USD
  const ONE_USD_E8 = 10n ** 8n; // = 1.00 USD expressed in 8-dec oracle units
  const wholeUsd = tvlUsdScaled / ONE_USD_E8;
  const fracUsd = tvlUsdScaled % ONE_USD_E8;
  const tvlUsd = Number(wholeUsd) + Number(fracUsd) / 1e8;

  return [
    {
      pool: `${SBTCD.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'btcd',
      symbol: 'sBTCD',
      tvlUsd,
      apyBase,
      underlyingTokens: [BTCD],
      poolMeta: 'BTCD staking vault (8h vesting, 7d cooldown)',
      url: 'https://btcd.fi',
      token: SBTCD,
    },
  ];
};

/**
 * @type {{ apy: () => Promise<object[]>, url: string }}
 *
 * - `apy` — see {@link apy}.
 * - `url` — protocol landing page (used by yield-server when a pool entry
 *   does not specify its own `url`).
 */
module.exports = {
  apy,
  url: 'https://btcd.fi',
};
