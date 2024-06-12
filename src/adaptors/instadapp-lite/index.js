const utils = require('../utils');

const API_URL =
  'https://api.instadapp.io/v2/mainnet/lite/users/0x0000000000000000000000000000000000000000/vaults';

const getApy = async () => {
  const vaultData = await utils.getData(API_URL);
  const pools = vaultData.map((item) => ({
    pool: item.vault,
    chain: utils.formatChain('ethereum'),
    project: 'instadapp-lite',
    symbol: item.token.symbol,
    tvlUsd: Number(item.vaultTVLInAsset) * item.token.price,
    apy: Number(item.apy.apyWithoutFee),
    underlyingTokens: [item.tokenAddress],
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://lite.instadapp.io/',
};
