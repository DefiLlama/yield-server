const sdk = require('@defillama/sdk');
const utils = require('../utils');

const MIN_TVL_USD = 1000;
const LOOKBACK_DAYS = 7;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

const ETHEREUM_VAULTS = [
  {
    address: '0x74aD2F789Ed583DBd141bbdafC673fE1F033718b',
    name: 'Sentora USD',
  },
  {
    address: '0xd000E6BcAd5457E8F4de67eDdeFe50BCC4B3d743',
    name: 'Sentora PRIME',
  },
  {
    address: '0xD0271E199f886Ff943859579465498B18eCF1E9d',
    name: 'Sentora ETH',
  },
  {
    address: '0x3cC0D33B1AEac3d23eA89214b3AC5B4607032167',
    name: 'Sentora BTC',
  },
];

const getTotalAssetsAbi = {
  inputs: [],
  name: 'getTotalAssets',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getSharePriceAbi = {
  inputs: [],
  name: 'getSharePrice',
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const multiCall = (calls, abi, block) =>
  sdk.api.abi.multiCall({
    calls,
    abi,
    chain: 'ethereum',
    permitFailure: true,
    ...(block && { block }),
  });

const getEthereumVaultData = async (vaults) => {
  const byVault = {};
  if (!vaults.length) return byVault;

  const calls = vaults.map((v) => ({ target: v.address }));
  const lookbackSeconds = LOOKBACK_DAYS * SECONDS_PER_DAY;
  const [priorBlock] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - lookbackSeconds],
    'ethereum'
  );

  const [assets, totalAssets, sharePrice, priorSharePrice] = await Promise.all([
    multiCall(calls, 'address:asset'),
    multiCall(calls, getTotalAssetsAbi),
    multiCall(calls, getSharePriceAbi),
    multiCall(calls, getSharePriceAbi, priorBlock),
  ]);

  const underlyingTokens = assets.output.map((o) => o.output);
  const knownTokens = [...new Set(underlyingTokens.filter(Boolean))];
  if (!knownTokens.length) return byVault;

  const tokenCalls = knownTokens.map((t) => ({ target: t }));
  const [symbols, decimals, prices] = await Promise.all([
    multiCall(tokenCalls, 'erc20:symbol'),
    multiCall(tokenCalls, 'erc20:decimals'),
    utils.getPrices(knownTokens, 'ethereum'),
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

  vaults.forEach((vault, i) => {
    const token = underlyingTokens[i];
    const info = tokenInfo[token];
    if (!info || !Number.isFinite(info.decimals) || !info.symbol || !info.price)
      return;

    const held = totalAssets.output[i].output;
    const current = Number(sharePrice.output[i].output);
    const prior = Number(priorSharePrice.output[i].output);
    if (held == null || !(current > 0) || !(prior > 0)) return;

    const scale = 10 ** info.decimals;
    byVault[vault.address] = {
      symbol: info.symbol,
      underlyingToken: token,
      tvlUsd: (Number(held) / scale) * info.price,
      pricePerShare: current / scale,
      apyBase:
        (Math.pow(current / prior, SECONDS_PER_YEAR / lookbackSeconds) - 1) *
        100,
    };
  });

  return byVault;
};

const buildEthereumPool = (vault, onchain) => {
  if (!onchain) {
    console.log(`sentora: no on-chain data for ${vault.address}, skipping`);
    return null;
  }

  return {
    pool: `${vault.address}-Ethereum`,
    chain: 'Ethereum',
    project: 'sentora-curator',
    poolMeta: vault.name,
    url: `https://app.upshift.finance/pools/1/${vault.address}`,
    symbol: onchain.symbol,
    tvlUsd: onchain.tvlUsd,
    apyBase: onchain.apyBase,
    pricePerShare: onchain.pricePerShare,
    underlyingTokens: [onchain.underlyingToken],
  };
};

const apy = async () => {
  const onchain = await getEthereumVaultData(ETHEREUM_VAULTS);

  // Kamino kvaults are listed by kamino-lend.
  const pools = ETHEREUM_VAULTS.map((v) =>
    buildEthereumPool(v, onchain[v.address])
  );

  return pools
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p) && p.tvlUsd >= MIN_TVL_USD);
};

module.exports = {
  protocolId: '6807',
  timetravel: false,
  apy,
  url: 'https://vaults.sentora.com/',
};
