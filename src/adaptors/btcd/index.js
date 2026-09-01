/**
 * @file Defillama yield-server adapter for the BTCD protocol's sBTCD ERC-4626
 * staking vault. Publishes a single Ethereum pool entry with TVL in USD and
 * a 30-day simple APR derived from `previewRedeem(1e18)` growth, annualised
 * on a 365-day year to match btcd.fi's public APY.
 */

const sdk = require('@defillama/sdk');

const CHAIN = 'ethereum';
const BTCD = '0xC6694e05B750015f54Ac646544a4a9D33cbe4086';
const SBTCD = '0x3BC801419479865B24b4d32faB0Bf64638Abbd5f';

// Chainlink BTC/USD — public infra, not the BTCD-specific oracle.
const BTC_USD_FEED = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
// Must match SBTCDOracle.P0_WAD; re-verify if that oracle is redeployed.
const P0_USD = 94000;

const SCALE = 10n ** 18n;
const SECONDS_PER_DAY = 86400;
const LOOKBACK_DAYS = 30;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;
// APR before this block would include pre-yield share prices and be wrong.
const SBTCD_YIELD_TURNED_ON_BLOCK = 24450207;

const previewRedeemAbi =
  'function previewRedeem(uint256 shares) view returns (uint256)';
const totalAssetsAbi = 'function totalAssets() view returns (uint256)';
const vestingPeriodAbi = 'function vestingPeriod() view returns (uint24)';
const cooldownDurationAbi = 'function cooldownDuration() view returns (uint24)';
const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)';

/**
 * Format a positive seconds count as a short label using the largest exact
 * unit (`d`/`h`/`m`/`s`). Returns null for 0, negative, or non-finite inputs
 * so the caller can drop the label.
 * @param {number} seconds
 * @returns {string | null}
 */
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/**
 * 30-day simple APR from sBTCD share-price growth. Pins both `previewRedeem`
 * reads to real blocks and uses actual block timestamps as the divisor, the
 * same shape as services/vault/sbtcdror/sbtcdrorcalculator.go.
 *
 * Returns null on any RPC failure, a pre-yield lookback, or non-positive
 * growth so the pool publishes with no APY rather than ingesting a misleading
 * 0% that would skew the trailing 30-day average — a failed read is "no data",
 * not a real zero return.
 * @returns {Promise<number | null>} APR as a percentage (e.g. 11.88 for
 *   11.88%), or null when it cannot be computed.
 */
async function computeApyBase() {
  let latest, old;
  try {
    latest = await sdk.api.util.getLatestBlock(CHAIN);
    const oldTarget = latest.timestamp - LOOKBACK_DAYS * SECONDS_PER_DAY;
    old = await sdk.api.util.lookupBlock(oldTarget, { chain: CHAIN });
  } catch (e) {
    return null;
  }
  if (
    !latest ||
    typeof latest.number !== 'number' ||
    typeof latest.timestamp !== 'number'
  ) {
    return null;
  }
  if (
    !old ||
    typeof old.block !== 'number' ||
    typeof old.timestamp !== 'number'
  ) {
    return null;
  }
  if (old.block < SBTCD_YIELD_TURNED_ON_BLOCK) return null;
  let nowVal, oldVal;
  try {
    const [nowRes, oldRes] = await Promise.all([
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [SCALE.toString()],
        block: latest.number,
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [SCALE.toString()],
        block: old.block,
      }),
    ]);
    nowVal = BigInt(nowRes.output);
    oldVal = BigInt(oldRes.output);
  } catch (e) {
    return null;
  }
  if (oldVal <= 0n || nowVal <= oldVal) return null;
  const rateScaled = ((nowVal - oldVal) * SCALE) / oldVal;
  const rate = Number(rateScaled) / 1e18;
  if (!isFinite(rate) || rate <= 0) return null;
  const secondsElapsed = latest.timestamp - old.timestamp;
  if (secondsElapsed <= 0) return null;
  return ((rate * SECONDS_PER_YEAR) / secondsElapsed) * 100;
}

/**
 * BTCD/USD spot price using the algorithmic peg
 *   `peg = sqrt(BTC_USD / P0_USD)`
 * Mirrors SBTCDOracle (services/contracts/price-oracle/src/PriceOracle.sol)
 * but reads Chainlink BTC/USD directly so the adapter has no dependency on
 * the BTCD protocol's own oracle.
 *
 * Returns null when the feed read fails or the answer is non-finite/<=0,
 * which signals `apy()` to skip publishing the pool instead of emitting a
 * TVL anchored to a hardcoded peg.
 * @returns {Promise<number | null>} USD price per 1 BTCD, or null on failure.
 */
async function btcdPriceUsd() {
  try {
    const r = await sdk.api.abi.call({
      chain: CHAIN,
      target: BTC_USD_FEED,
      abi: latestRoundDataAbi,
    });
    const btcUsd = Number(r.output[1]) / 1e8;
    if (!isFinite(btcUsd) || btcUsd <= 0) return null;
    return Math.sqrt(btcUsd / P0_USD);
  } catch (e) {
    return null;
  }
}

/**
 * Defillama yield-server entrypoint. Reads sBTCD's totalAssets, BTCD/USD peg,
 * 30-day APR, and live vesting/cooldown parameters in one fan-out, then emits
 * a single pool entry. Returns an empty array (defillama keeps the prior
 * snapshot) when TVL or price reads fail so we never publish bogus values.
 *
 * @returns {Promise<Array<{
 *   pool: string,
 *   chain: string,
 *   project: string,
 *   symbol: string,
 *   tvlUsd: number,
 *   apyBase: number | null,
 *   pricePerShare: number | null,
 *   underlyingTokens: string[],
 *   poolMeta: string,
 *   url: string,
 *   token: string,
 * }>>}
 */
const apy = async () => {
  const [
    sBtcdAssetsRes,
    price,
    sBtcdApyBase,
    vestingRes,
    cooldownRes,
    previewRedeemRes,
  ] = await Promise.all([
    sdk.api.abi
      .call({ chain: CHAIN, target: SBTCD, abi: totalAssetsAbi })
      .catch(() => null),
    btcdPriceUsd(),
    computeApyBase(),
    sdk.api.abi
      .call({ chain: CHAIN, target: SBTCD, abi: vestingPeriodAbi })
      .catch(() => null),
    sdk.api.abi
      .call({ chain: CHAIN, target: SBTCD, abi: cooldownDurationAbi })
      .catch(() => null),
    sdk.api.abi
      .call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [SCALE.toString()],
      })
      .catch(() => null),
  ]);
  if (!sBtcdAssetsRes?.output || price == null) return [];
  let sBtcdAssets;
  try {
    sBtcdAssets = BigInt(sBtcdAssetsRes.output);
  } catch (e) {
    return [];
  }
  const sBtcdTvlUsd = (Number(sBtcdAssets) / 1e18) * price;

  // ERC-4626 share price: BTCD assets redeemable per 1 sBTCD share. null when
  // the read fails or the result is non-finite/<=0 so we never publish a bogus
  // price-per-share alongside an otherwise valid pool.
  let pricePerShare = null;
  if (previewRedeemRes?.output != null) {
    try {
      const pps = Number(BigInt(previewRedeemRes.output)) / 1e18;
      if (isFinite(pps) && pps > 0) pricePerShare = pps;
    } catch (e) {
      pricePerShare = null;
    }
  }

  const metaParts = [];
  const vestingLabel =
    vestingRes?.output != null
      ? formatDuration(Number(vestingRes.output))
      : null;
  if (vestingLabel) metaParts.push(`${vestingLabel} vesting`);
  const cooldownLabel =
    cooldownRes?.output != null
      ? formatDuration(Number(cooldownRes.output))
      : null;
  if (cooldownLabel) metaParts.push(`${cooldownLabel} cooldown`);
  const poolMeta =
    metaParts.length > 0
      ? `BTCD staking vault (${metaParts.join(', ')})`
      : 'BTCD staking vault';

  return [
    {
      pool: `${SBTCD.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'btcd',
      symbol: 'sBTCD',
      tvlUsd: sBtcdTvlUsd,
      apyBase: sBtcdApyBase,
      pricePerShare,
      underlyingTokens: [BTCD],
      poolMeta,
      url: 'https://btcd.fi/app/stake/btcd',
      token: SBTCD,
    },
  ];
};

/**
 * Defillama yield-server adapter module export.
 * @property {() => Promise<Array<object>>} apy  Per-cycle pool builder.
 * @property {string} url  Protocol-root URL surfaced on defillama's project
 *   page. The per-pool deep link to the staking page lives on the pool
 *   entry's own `url` field, set inside `apy()`.
 */
module.exports = {
  protocolId: '7897',
  apy,
  url: 'https://btcd.fi',
};
