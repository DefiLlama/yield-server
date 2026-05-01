const sdk = require('@defillama/sdk');
const axios = require('axios');

// BTCD: synthetic basket-backed token (~50% BTC / ~50% USD), RFQ-minted via BTCDMinting.
// sBTCD: ERC-4626 staking vault over BTCD with 8h linear vesting and 7-day Silo cooldown.
// SBTCDOracle: on-chain Chainlink-compatible oracle returning sBTCD/USD in 8 decimals.

const CHAIN = 'ethereum';
const BTCD = '0xC6694e05B750015f54Ac646544a4a9D33cbe4086';
const SBTCD = '0x3BC801419479865B24b4d32faB0Bf64638Abbd5f';
const SBTCD_ORACLE = '0x332ebF042a7B7D87A8a2628186f8A5B12d8a6d94';

// APR methodology mirrors the protocol's canonical sBTCD rate-of-return
// calculator at services/vault/sbtcdror/sbtcdrorcalculator.go:
//   - 30-day window
//   - PreviewRedeem(1e18) for share-price reads
//   - Simple APR (not compound APY) with a 365.25-day year
//   - Clamp the start block to SBTCDYieldTurnedOnBlock so we never sample
//     share prices from before yield was activated
const WAD = '1000000000000000000'; // 1e18
const SCALE = 10n ** 18n;
const SECONDS_PER_DAY = 86400;
const LOOKBACK_DAYS = 30;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
const SBTCD_YIELD_TURNED_ON_BLOCK = 24450207;

const previewRedeemAbi =
  'function previewRedeem(uint256 shares) view returns (uint256)';
const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

const getBlockAtTimestamp = async (chain, timestamp) =>
  (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`)).data
    .height;

// Returns 0 (instead of throwing) if the historical block is unavailable or
// pre-dates yield activation, so a young vault still publishes a 0% APR
// alongside a valid TVL rather than failing the whole adapter run.
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
  // tvlUsd = totalSupply × price / 10^(18+8) = USD raw with 8 decimals.
  // Split the BigInt into whole+fractional dollars so we don't lose cents
  // of precision once total TVL grows past Number.MAX_SAFE_INTEGER (~$90M
  // when expressed at 8-decimal scale).
  const tvlUsdScaled = (totalSupply * priceUsd_e8) / 10n ** 18n; // 8-decimal USD
  const HUNDRED_M = 10n ** 8n;
  const wholeUsd = tvlUsdScaled / HUNDRED_M;
  const fracUsd = tvlUsdScaled % HUNDRED_M;
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

module.exports = {
  timetravel: false,
  apy,
  url: 'https://btcd.fi',
};
