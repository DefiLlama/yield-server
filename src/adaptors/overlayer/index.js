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
// apyBase   = (pps(now) / pps(1d ago))^365 - 1
// apyBase7d = (pps(now) / pps(7d ago))^(365/7) - 1

const PROJECT = 'overlayer';
const CHAIN = 'ethereum';
const URL = 'https://app.overlayer.fi';
const DAY = 24 * 3600;
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

const annualise = (newer, older, days) => {
  if (!(newer > 0) || !(older > 0)) return 0;
  const ratio = newer / older;
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 0;
  const apy = (ratio ** (365 / days) - 1) * 100;
  return Number.isFinite(apy) && apy > 0 ? apy : 0;
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1e3);
  // [0]=now, [1]=1d ago, [2]=7d ago
  const timestamps = [now, now - DAY, now - 7 * DAY];

  const [{ pricesByAddress }, blocks] = await Promise.all([
    getPrices(
      VAULTS.map((v) => v.underlying),
      CHAIN
    ),
    getBlocksByTime(timestamps, CHAIN),
  ]);

  const pools = (
    await Promise.all(
      VAULTS.map(async (v) => {
        const price = pricesByAddress[v.underlying.toLowerCase()];
        if (!Number.isFinite(price) || price <= 0) {
          console.log(
            `Missing price for ${v.underlying} on ${CHAIN}; skipping ${v.symbol}`
          );
          return null;
        }

        const [totalAssetsRes, ppsNow, pps1d, pps7d] = await Promise.all([
          sdk.api.abi.call({
            target: v.vault,
            abi: 'uint256:totalAssets',
            chain: CHAIN,
            block: blocks[0],
          }),
          convertToAssets(v.vault, blocks[0]),
          convertToAssets(v.vault, blocks[1]),
          convertToAssets(v.vault, blocks[2]),
        ]);

        const tvlUsd = (Number(totalAssetsRes.output) / 1e18) * price;
        if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
          throw new Error(`Invalid tvlUsd for ${v.symbol}: ${tvlUsd}`);
        }

        return {
          pool: `${v.vault}-${CHAIN}`.toLowerCase(),
          chain: formatChain(CHAIN),
          project: PROJECT,
          symbol: v.symbol,
          tvlUsd,
          apyBase: annualise(ppsNow, pps1d, 1),
          apyBase7d: annualise(ppsNow, pps7d, 7),
          pricePerShare: ppsNow / 1e18,
          underlyingTokens: [v.underlying],
          token: v.vault,
          url: URL,
        };
      })
    )
  ).filter(Boolean);

  return pools;
};

module.exports = {
  protocolId: '9240',
  timetravel: false,
  apy,
  url: URL,
};
