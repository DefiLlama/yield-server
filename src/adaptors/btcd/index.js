// BTCD yield-server adapter — single Ethereum pool (sBTCD ERC-4626 staking
// vault) with TVL and 30-day simple APR. APR mirrors
// services/vault/sbtcdror/sbtcdrorcalculator.go: previewRedeem(1e18) growth
// over a 30-day window, simple-rate annualised on a 365.25-day year, clamped
// to the yield-activation block.

const sdk = require('@defillama/sdk');
const axios = require('axios');

const CHAIN = 'ethereum';
const BTCD = '0xC6694e05B750015f54Ac646544a4a9D33cbe4086';
const SBTCD = '0x3BC801419479865B24b4d32faB0Bf64638Abbd5f';

// Chainlink BTC/USD aggregator (public infra; not the BTCD-specific oracle).
const BTC_USD_FEED = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
// Initial BTC/USD reference; peg = sqrt(BTC_USD / P0) algorithmically.
// Must match SBTCDOracle.P0_WAD at deploy. Re-verify if the oracle is redeployed.
const P0_USD = 94000;

const SCALE = 10n ** 18n;
const SECONDS_PER_DAY = 86400;
const LOOKBACK_DAYS = 30;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
// First block at which the YieldDistributor delivered yield to sBTCD; share
// prices before this would corrupt the APR ratio.
const SBTCD_YIELD_TURNED_ON_BLOCK = 24450207;

const previewRedeemAbi =
  'function previewRedeem(uint256 shares) view returns (uint256)';
const totalAssetsAbi = 'function totalAssets() view returns (uint256)';
const latestRoundDataAbi =
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)';

const getBlockAtTimestamp = async (chain, timestamp) =>
  (await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`)).data
    .height;

async function computeApyBase() {
  const nowTs = Math.floor(Date.now() / 1000);
  const oldTs = nowTs - LOOKBACK_DAYS * SECONDS_PER_DAY;
  let oldBlock;
  try {
    oldBlock = await getBlockAtTimestamp(CHAIN, oldTs);
  } catch (e) {
    return 0;
  }
  if (oldBlock < SBTCD_YIELD_TURNED_ON_BLOCK) return 0;
  let nowVal, oldVal;
  try {
    const [nowRes, oldRes] = await Promise.all([
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [SCALE.toString()],
      }),
      sdk.api.abi.call({
        chain: CHAIN,
        target: SBTCD,
        abi: previewRedeemAbi,
        params: [SCALE.toString()],
        block: oldBlock,
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
  const secondsElapsed = nowTs - oldTs;
  return ((rate * SECONDS_PER_YEAR) / secondsElapsed) * 100;
}

// Algorithmic peg: peg = sqrt(BTC_USD / P0). Mirrors SBTCDOracle's formula
// (services/contracts/price-oracle/src/PriceOracle.sol) but reads Chainlink
// BTC/USD directly so the adapter doesn't depend on the protocol's own oracle.
async function btcdPriceUsd() {
  try {
    const r = await sdk.api.abi.call({
      chain: CHAIN,
      target: BTC_USD_FEED,
      abi: latestRoundDataAbi,
    });
    const btcUsd = Number(r.output[1]) / 1e8; // Chainlink BTC/USD has 8 decimals
    if (!isFinite(btcUsd) || btcUsd <= 0) return 1.0;
    return Math.sqrt(btcUsd / P0_USD);
  } catch (e) {
    return 1.0;
  }
}

const apy = async () => {
  const [sBtcdAssetsRes, price, sBtcdApyBase] = await Promise.all([
    sdk.api.abi.call({ chain: CHAIN, target: SBTCD, abi: totalAssetsAbi }),
    btcdPriceUsd(),
    computeApyBase(),
  ]);
  const sBtcdTvlUsd = (Number(BigInt(sBtcdAssetsRes.output)) / 1e18) * price;

  return [
    {
      pool: `${SBTCD.toLowerCase()}-ethereum`,
      chain: 'Ethereum',
      project: 'btcd',
      symbol: 'sBTCD',
      tvlUsd: sBtcdTvlUsd,
      apyBase: sBtcdApyBase,
      underlyingTokens: [BTCD],
      poolMeta: 'BTCD staking vault (8h vesting)',
      url: 'https://btcd.fi/app/stake/btcd',
      token: SBTCD,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://btcd.fi',
};
