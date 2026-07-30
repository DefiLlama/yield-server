const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'zensats';
const CHAIN = 'ethereum';
const URL = 'https://zensats.app';

const DAY = 86400;

// ZenSats "Zenji" vaults are ERC-4626 leverage loops: the collateral asset is
// deposited, USDT is borrowed against it on LlamaLend and the proceeds are
// looped back in. Yield accrues into the share price, so apyBase is the growth
// of convertToAssets(1 share).
//
// The share price is denominated in the collateral asset while the debt is
// stablecoin-denominated, so it is NOT monotonic — it marks to market with the
// collateral/debt price ratio. A 24h window annualises that noise (both vaults
// read negative over 24h while their 7d/14d/30d growth was positive), so the
// 7 day growth is reported as apyBase and the 24h figure is only a fallback
// for when the 7d reading is unusable (same approach as the geth adapter).
const VAULTS = [
  {
    address: '0x18E2F4F2E6565187fce73ECC707579E5F7933f74',
    symbol: 'WBTC',
    underlyingToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    decimals: 8,
    poolMeta: 'USDT/crvUSD LlamaLend StakeDAO',
    url: `${URL}/vault/wbtc-llamalend`,
  },
  {
    address: '0x23F189dE34EED95f6303CfF1C77f7676F211Dd2c',
    symbol: 'wstETH',
    underlyingToken: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    decimals: 18,
    poolMeta: 'USDT/crvUSD LlamaLend StakeDAO',
    url: `${URL}/vault/wsteth-llamalend`,
  },
];

const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) view returns (uint256)';

const apy = async (timestamp) => {
  const now = timestamp || Math.floor(Date.now() / 1e3);
  const [block7d, block1d] = await Promise.all(
    [7, 1].map((days) =>
      utils
        .getPriceApiData(`/block/${CHAIN}/${now - days * DAY}`)
        .then((r) => r.height)
    )
  );

  const { pricesByAddress } = await utils.getPrices(
    [...new Set(VAULTS.map((v) => v.underlyingToken))],
    CHAIN
  );

  // convertToAssets is quoted per whole share, so scale by the share decimals
  // (which equal the underlying's decimals on these vaults).
  const calls = VAULTS.map((v) => ({
    target: v.address,
    params: [(10n ** BigInt(v.decimals)).toString()],
  }));

  const [totalAssets, ppsNow, pps7d, pps1d] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: VAULTS.map((v) => ({ target: v.address })),
      abi: 'uint256:totalAssets',
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls,
      abi: CONVERT_TO_ASSETS_ABI,
      chain: CHAIN,
      permitFailure: true,
    }),
    ...[block7d, block1d].map((block) =>
      sdk.api.abi.multiCall({
        calls,
        abi: CONVERT_TO_ASSETS_ABI,
        chain: CHAIN,
        block,
        permitFailure: true,
      })
    ),
  ]);

  return VAULTS.map((v, i) => {
    const price = pricesByAddress[v.underlyingToken.toLowerCase()];
    const total = Number(totalAssets.output[i]?.output);
    if (!price || !Number.isFinite(total)) return null;

    const unit = 10 ** v.decimals;
    const current = Number(ppsNow.output[i]?.output);
    // Without a current share price there is no APY to report. Drop the pool
    // rather than publishing apyBase: 0, which would overwrite the last good
    // value with a rate the vault never paid.
    if (!(current > 0)) return null;

    // Annualized share-price growth over `days`, or null when the historical
    // endpoint is missing — a vault deployed inside the window, or a failed
    // archive call. Then apyBase: 0 is correct: no growth has been observed.
    const growth = (pastRes, days) => {
      const past = Number(pastRes.output[i]?.output);
      if (!(past > 0)) return null;
      const value = ((current / past) ** (365 / days) - 1) * 100;
      return Number.isFinite(value) ? value : null;
    };

    const apyBase7d = growth(pps7d, 7);
    const apyBase1d = growth(pps1d, 1);

    return {
      pool: `${v.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: v.symbol,
      tvlUsd: (total / unit) * price,
      apyBase: apyBase7d ?? apyBase1d ?? 0,
      ...(apyBase7d !== null && { apyBase7d }),
      pricePerShare: current / unit,
      underlyingTokens: [v.underlyingToken],
      token: v.address,
      poolMeta: v.poolMeta,
      url: v.url,
    };
  }).filter(Boolean);
};

module.exports = {
  protocolId: '7621',
  timetravel: false,
  apy,
  url: URL,
};
