const utils = require('../utils');

const LITE_ETH_VAULT_URL =
  'https://api.instadapp.io/v2/mainnet/lite/users/0x0000000000000000000000000000000000000000/vaults';

const LITE_USD_VAULT_URL =
  'https://api.fluid-lite.instadapp.ai/lite-usd/vault';

const getLiteEthPool = async () => {
  const vaultData = await utils.getData(LITE_ETH_VAULT_URL);
  return vaultData.map((item) => ({
    pool: item.vault,
    chain: utils.formatChain('ethereum'),
    project: 'fluid-lite',
    symbol: item.token.symbol,
    tvlUsd: Number(item.vaultTVLInAsset) * item.token.price,
    apy: Number(item.apy.apyWithoutFee),
    underlyingTokens: [item.tokenAddress],
  }));
};

/** API `rate` is basis points of APY (e.g. 690 → 6.9%). */
const getLiteUsdPool = async () => {
  const res = await utils.getData(LITE_USD_VAULT_URL);
  if (!res?.success || !res.data) return [];

  const d = res.data;
  const { underlyingAsset, asset, totalAssets, address, rate } = d;
  const decimals = Number(underlyingAsset.decimals);
  const price = Number(underlyingAsset.price);
  const tvlUsd =
    (Number(totalAssets) / 10 ** decimals) * (Number.isFinite(price) ? price : 1);

  return [
    {
      pool: address,
      chain: utils.formatChain('ethereum'),
      project: 'fluid-lite',
      symbol: utils.formatSymbol(underlyingAsset.symbol),
      tvlUsd,
      apy: Number(rate) / 100,
      underlyingTokens: [asset],
    },
  ];
};

const getApy = async () => {
  const [legacy, liteUsd] = await Promise.all([
    getLiteEthPool().catch((err) => {
      console.error('fluid-lite legacy vaults:', err);
      return [];
    }),
    getLiteUsdPool().catch((err) => {
      console.error('fluid-lite lite-usd vault:', err);
      return [];
    }),
  ]);

  return [...legacy, ...liteUsd];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://fluid.io/lite/1',
};
