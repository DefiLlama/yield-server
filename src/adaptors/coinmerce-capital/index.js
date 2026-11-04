const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'hyperliquid';
const MIN_TVL_USD = 1000;
const LOOKBACK_DAYS = 30;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

// Upshift multi-asset vaults: not ERC-4626, expose asset() + getTotalAssets() + getSharePrice();
// deposits are represented by a separate lpTokenAddress() share token
const VAULTS = [
  {
    address: '0xcfe06d2499aE635830D11859941e76354D5717CC',
    url: 'https://app.upshift.finance/vaults/hyperevm/coinmerce-capital-usdc',
  },
];

const getTotalAssetsAbi = 'uint256:getTotalAssets';
const getSharePriceAbi = 'uint256:getSharePrice';

const multiCall = (calls, abi, block) =>
  sdk.api.abi.multiCall({
    calls,
    abi,
    chain: CHAIN,
    permitFailure: true,
    ...(block && { block }),
  });

const apy = async () => {
  const calls = VAULTS.map((v) => ({ target: v.address }));
  const lookbackSeconds = LOOKBACK_DAYS * SECONDS_PER_DAY;
  const [priorBlock] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - lookbackSeconds],
    CHAIN
  );

  const [assets, lpTokens, totalAssets, sharePrice, priorSharePrice] =
    await Promise.all([
      multiCall(calls, 'address:asset'),
      multiCall(calls, 'address:lpTokenAddress'),
      multiCall(calls, getTotalAssetsAbi),
      multiCall(calls, getSharePriceAbi),
      multiCall(calls, getSharePriceAbi, priorBlock),
    ]);

  const underlyingTokens = assets.output.map((o) => o.output);
  const knownTokens = [...new Set(underlyingTokens.filter(Boolean))];
  if (!knownTokens.length) return [];

  const tokenCalls = knownTokens.map((t) => ({ target: t }));
  const [symbols, decimals, prices] = await Promise.all([
    multiCall(tokenCalls, 'erc20:symbol'),
    multiCall(tokenCalls, 'erc20:decimals'),
    utils.getPrices(knownTokens, CHAIN),
  ]);

  const tokenInfo = {};
  knownTokens.forEach((token, i) => {
    const tokenDecimals = decimals.output[i].output;
    tokenInfo[token] = {
      symbol: symbols.output[i].output,
      decimals: tokenDecimals == null ? null : Number(tokenDecimals),
      price: prices.pricesByAddress[token.toLowerCase()],
    };
  });

  const pools = VAULTS.map((vault, i) => {
    const token = underlyingTokens[i];
    const info = tokenInfo[token];
    if (!info || !Number.isFinite(info.decimals) || !info.symbol || !info.price)
      return null;

    const held = totalAssets.output[i].output;
    const current = Number(sharePrice.output[i].output);
    const prior = Number(priorSharePrice.output[i].output);
    if (held == null || !(current > 0) || !(prior > 0)) return null;

    // share price is denominated in underlying token decimals
    const scale = 10 ** info.decimals;
    return {
      pool: `${vault.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'coinmerce-capital',
      url: vault.url,
      symbol: info.symbol,
      tvlUsd: (Number(held) / scale) * info.price,
      apyBase:
        (Math.pow(current / prior, SECONDS_PER_YEAR / lookbackSeconds) - 1) *
        100,
      pricePerShare: current / scale,
      underlyingTokens: [token],
      token: lpTokens.output[i].output,
    };
  });

  return pools
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p) && p.tvlUsd >= MIN_TVL_USD);
};

module.exports = {
  protocolId: '8249',
  timetravel: false,
  apy,
  url: 'https://app.upshift.finance/vaults/hyperevm/coinmerce-capital-usdc',
};
