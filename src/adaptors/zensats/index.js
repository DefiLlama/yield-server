const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'zensats';
const CHAIN = 'ethereum';
const URL = 'https://zensats.app';

const DAY = 86400;
const LOOKBACK_DAYS = 7;

// ZenSats Zenji vaults are ERC-4626 leverage loops on LlamaLend. Yield accrues
// into share price (convertToAssets). Share price marks to market with the
// collateral/debt ratio, so a 24h window is noisy — apyBase uses 7d growth
// instead of the 1d window in utils.getERC4626Info.
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
  const block7d = (
    await utils.getPriceApiData(
      `/block/${CHAIN}/${now - LOOKBACK_DAYS * DAY}`
    )
  ).height;

  const { pricesByAddress } = await utils.getPrices(
    VAULTS.map((v) => v.underlyingToken),
    CHAIN
  );

  // convertToAssets is per whole share; share decimals match underlying here.
  const shareCalls = VAULTS.map((v) => ({
    target: v.address,
    params: [(10n ** BigInt(v.decimals)).toString()],
  }));

  const [totalAssets, ppsNow, pps7d] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: VAULTS.map((v) => ({ target: v.address })),
      abi: 'uint256:totalAssets',
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: shareCalls,
      abi: CONVERT_TO_ASSETS_ABI,
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: shareCalls,
      abi: CONVERT_TO_ASSETS_ABI,
      chain: CHAIN,
      block: block7d,
      permitFailure: true,
    }),
  ]);

  return VAULTS.map((v, i) => {
    const price = pricesByAddress[v.underlyingToken.toLowerCase()];
    const totalRes = totalAssets.output[i];
    const total = Number(totalRes?.output);
    if (
      !price ||
      totalRes?.success === false ||
      !Number.isFinite(total) ||
      total <= 0
    )
      return null;

    const unit = 10 ** v.decimals;
    const current = Number(ppsNow.output[i]?.output);
    const past = Number(pps7d.output[i]?.output);
    // Drop the pool if share price is unreadable rather than publishing
    // apyBase: 0 (would overwrite the last good rate).
    if (!(current > 0)) return null;

    let apyBase = null;
    if (past > 0) {
      const value =
        ((current / past) ** (365 / LOOKBACK_DAYS) - 1) * 100;
      apyBase = Number.isFinite(value) ? value : null;
    }

    return {
      pool: `${v.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: v.symbol,
      tvlUsd: (total / unit) * price,
      apyBase,
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
