const utils = require('../utils');

const API_URL = 'https://api.forgeyields.com/strategies';

const underlyingTokens = {
  ethereum: {
    ETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
    USDC: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    WBTC: ['0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'],
  },
  starknet: {
    ETH: ['0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'],
    USDC: ['0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'],
    WBTC: ['0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac'],
  },
};

const apy = async () => {
  const strategies = await utils.getData(API_URL);

  const pools = [];
  for (const s of strategies) {
    for (const gw of s.token_gateway_per_domain) {
      const chain = gw.domain;
      const tokens = underlyingTokens[chain]?.[s.underlyingSymbol];
      if (!tokens) continue;

      pools.push({
        pool: `${gw.token_gateway}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'forgeyields',
        symbol: s.underlyingSymbol,
        tvlUsd: Number(s.tvlUSD),
        apyBase: Number(s.integrationInfo?.overallApy ?? s.apy7d),
        apyBase7d: Number(s.apy7d),
        poolMeta: s.symbol,
        url: 'https://app.forgeyields.com',
        token: gw.token_gateway,
        underlyingTokens: tokens,
      });
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.forgeyields.com',
};
