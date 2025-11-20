const utils = require('../utils');

const API_URL =
  'https://boost-gateway.btcfi.one/v1/products/5534c4c2-9cb4-4514-99f5-4c79a7030b27';
const PROJECT_NAME = 'btcfi';

const apy = async () => {
  const data = await utils.getData(API_URL);

  const cbBTCPool = {
    pool: `0x4F7aB59b5AC112970F5dD66D8a7ac505c8E5e08B-base`.toLowerCase(),
    chain: utils.formatChain('base'),
    project: PROJECT_NAME,
    symbol: data.principalAssets[0].asset.symbol, // cbBTC
    tvlUsd: Number(data.tvl),
    apyBase: Number(data.estimatedApyRate),
    underlyingTokens: [data.principalAssets[0].asset.address], // cbBTC address
    rewardTokens: data.rewardAssets.map((r) => r.asset.address), // USDC
    url: 'https://btcfi.one/',
  };

  return [cbBTCPool];
};

module.exports = {
  apy: apy,
  url: 'https://btcfi.one/',
};
