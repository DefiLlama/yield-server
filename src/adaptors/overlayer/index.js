const sdk = require('@defillama/sdk');
const {
  formatChain,
  getBlocksByTime,
  getPrices,
} = require('../utils');

// Overlayer staking vaults (ERC-4626) on Ethereum.
// Deposit T+ / C+ / G+ and receive sT+ / sC+ / sG+. Yield is Aave surplus on the
// wrap backing, minted into more wrap and allocated to the vault share price.
// Protocol page: https://defillama.com/protocol/overlayer (id 9240).
//
// apyBase is the simple moving average of the last 7 one-day share-price APYs:
// for each day i in [0..6], annualise pps(t-i) / pps(t-i-1), then average.

const PROJECT = 'overlayer';
const CHAIN = 'ethereum';
const URL = 'https://app.overlayer.fi';
const DAY = 24 * 3600;
const LOOKBACK_DAYS = 7;
const SHARE_UNIT = (10n ** 18n).toString(); // one whole share

const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) view returns (uint256)';

const VAULTS = [
  {
    symbol: 'sT+',
    vault: '0x001F7096A4521C1945543E458798aF9233140ED7',
    underlying: '0xBfaE8C8500cD35B652373a3Ad5BaA0D604A05a29', // T+
  },
  {
    symbol: 'sC+',
    vault: '0x8aC6AD5D76D07B202832f323888B64286E944A9e',
    underlying: '0xB17EE7D061e076ff1aD6bd2141888CFb39C0Ccdc', // C+
  },
  {
    symbol: 'sG+',
    vault: '0xcda929Ac3016A17151CD63c1Ca210cFc56D85333',
    underlying: '0xD4E1CAF200b29585aADc9AF39c16D57C8c82EbF1', // G+
  },
];

const convertToAssets = async (vault, block) =>
  Number(
    (
      await sdk.api.abi.call({
        target: vault,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [SHARE_UNIT],
        chain: CHAIN,
        block,
      })
    ).output
  );

const sevenDayMovingAverageApy = (ppsSeries) => {
  // ppsSeries[0] = now, [1] = 1d ago, ..., [7] = 7d ago
  const dailyApys = [];
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const newer = ppsSeries[i];
    const older = ppsSeries[i + 1];
    if (!(newer > 0) || !(older > 0)) continue;
    const ratio = newer / older;
    if (!(ratio > 0) || !Number.isFinite(ratio)) continue;
    const annualised = (ratio ** 365 - 1) * 100;
    if (Number.isFinite(annualised) && annualised > 0) {
      dailyApys.push(annualised);
    }
  }
  if (!dailyApys.length) return 0;
  return dailyApys.reduce((a, b) => a + b, 0) / dailyApys.length;
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  const timestamps = Array.from(
    { length: LOOKBACK_DAYS + 1 },
    (_, i) => now - i * DAY
  );

  const [{ pricesByAddress }, blocks] = await Promise.all([
    getPrices(
      VAULTS.map((v) => v.underlying),
      CHAIN
    ),
    getBlocksByTime(timestamps, CHAIN),
  ]);

  const pools = await Promise.all(
    VAULTS.map(async (v) => {
      const price = pricesByAddress[v.underlying.toLowerCase()];
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Missing price for ${v.underlying} on ${CHAIN}`);
      }

      const [totalAssetsRes, ...ppsSeries] = await Promise.all([
        sdk.api.abi.call({
          target: v.vault,
          abi: 'uint256:totalAssets',
          chain: CHAIN,
          block: blocks[0],
        }),
        ...blocks.map((block) => convertToAssets(v.vault, block)),
      ]);

      const tvlUsd = (Number(totalAssetsRes.output) / 1e18) * price;
      if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
        throw new Error(`Invalid tvlUsd for ${v.symbol}: ${tvlUsd}`);
      }

      const pricePerShare = ppsSeries[0] / 1e18;
      const apyBase = sevenDayMovingAverageApy(ppsSeries);

      return {
        pool: `${v.vault}-${CHAIN}`.toLowerCase(),
        chain: formatChain(CHAIN),
        project: PROJECT,
        symbol: v.symbol,
        tvlUsd,
        apyBase,
        pricePerShare,
        underlyingTokens: [v.underlying],
        token: v.vault,
        url: URL,
        poolMeta: 'Staking vault',
      };
    })
  );

  return pools;
};

module.exports = {
  protocolId: '9240',
  timetravel: false,
  apy,
  url: URL,
};
