// sBTCD ERC-4626 staking vault: TVL + 30-day simple APR from previewRedeem
// growth, annualised on 365 days to match btcd.fi's public APY.

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
const cooldownDurationAbi =
  'function cooldownDuration() view returns (uint24)';
const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)';

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// Mirrors services/vault/sbtcdror/sbtcdrorcalculator.go: pins both share-price
// reads to real blocks and uses actual block timestamps as the divisor.
async function computeApyBase() {
  let latest, old;
  try {
    latest = await sdk.api.util.getLatestBlock(CHAIN);
    const oldTarget = latest.timestamp - LOOKBACK_DAYS * SECONDS_PER_DAY;
    old = await sdk.api.util.lookupBlock(oldTarget, { chain: CHAIN });
  } catch (e) {
    return 0;
  }
  if (old.block < SBTCD_YIELD_TURNED_ON_BLOCK) return 0;
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
    return 0;
  }
  if (oldVal <= 0n || nowVal <= oldVal) return 0;
  const rateScaled = ((nowVal - oldVal) * SCALE) / oldVal;
  const rate = Number(rateScaled) / 1e18;
  if (!isFinite(rate) || rate <= 0) return 0;
  const secondsElapsed = latest.timestamp - old.timestamp;
  if (secondsElapsed <= 0) return 0;
  return ((rate * SECONDS_PER_YEAR) / secondsElapsed) * 100;
}

// peg = sqrt(BTC_USD / P0) — mirrors SBTCDOracle (services/contracts/
// price-oracle/src/PriceOracle.sol) but reads Chainlink directly. Returns
// null on failure so apy() skips the pool instead of publishing a stale peg.
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

const apy = async () => {
  const [sBtcdAssetsRes, price, sBtcdApyBase, vestingRes, cooldownRes] =
    await Promise.all([
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
    ]);
  if (!sBtcdAssetsRes?.output || price == null) return [];
  let sBtcdAssets;
  try {
    sBtcdAssets = BigInt(sBtcdAssetsRes.output);
  } catch (e) {
    return [];
  }
  const sBtcdTvlUsd = (Number(sBtcdAssets) / 1e18) * price;

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
      underlyingTokens: [BTCD],
      poolMeta,
      url: 'https://btcd.fi/app/stake/btcd',
      token: SBTCD,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://btcd.fi',
};
