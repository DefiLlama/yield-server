const utils = require('../utils');
const axios = require('axios');

const chains = {
  1: {
    name: 'ethereum',
    slug: 'mainnet',
  },
  8453: {
    name: 'base',
    slug: 'base',
  },
  42161: {
    name: 'arbitrum',
    slug: 'arbitrum',
  },
  10: {
    name: 'optimism',
    slug: 'optimism',
  },
  146: {
    name: 'sonic',
    slug: 'sonic',
  },
  5000: {
    name: 'mantle',
    slug: 'mantle',
  },
  56: {
    name: 'bsc',
    slug: 'binance',
  },
  137: {
    name: 'polygon',
    slug: 'polygon',
  },
  43114: {
    name: 'avax',
    slug: 'avalanche',
  },
  252: {
    name: 'fraxtal',
    slug: 'fraxtal',
  },
  32500: {
    name: 'hyperliquid',
    slug: 'hyperliquid',
  },
};

const api = (chainId) =>
  `https://api-v2.napier.finance/v1/market?chainIds=${chainId}&minimumTvlUsd=0&orderBy=totalTvlInUsd&orderDirection=desc&skip=0&take=10000`;

const formatMaturity = (maturity) =>
  new Date(Number(maturity) * 1000).toDateString('en-US');

const poolId = (address, chainId) =>
  `${address}-${chains[chainId].name}`.toLowerCase();

async function apy() {
  const markets = await Promise.all(
    Object.keys(chains).map((chainId) =>
      axios.get(api(chainId)).then((res) => res.data)
    )
  ).then((res) => res.flat());

  const apys = markets
    .filter((m) => !m.status.isMatured)
    .map((market) => {
      const chain = chains[market.chainId];

      const rewardTokens = market.metrics.underlyingRewards?.map(r => r.rewardToken.address) || [];
      const rewardApy = market.metrics.underlyingRewardsApy || 0;

      // LP Pool APY
      const lpApy = {
        pool: poolId(market.pool.address, market.chainId),
        chain: utils.formatChain(chain.name),
        project: 'napier-v2',
        symbol: utils.formatSymbol(market.tokens.targetToken.symbol),
        tvlUsd: Number(market.metrics.poolTvlInUsdFmt),
        apyBase: Number(market.metrics.poolBaseApy),
        apyReward: Number(rewardApy),
        rewardTokens,
        underlyingTokens: [market.tokens.principalToken.address, market.tokens.targetToken.address],
        poolMeta: `LP Pool | Maturity ${formatMaturity(market.maturityTimestamp)}`,
        url: `https://app.napier.finance/user/pool/${market.chainId}/${market.pool.address}/zap/add`,
      };

      // Fixed Rate (Principal Token) APY
      const ptApy = {
        pool: poolId(market.tokens.principalToken.address, market.chainId),
        chain: utils.formatChain(chain.name),
        project: 'napier-v2',
        symbol: utils.formatSymbol(market.tokens.targetToken.symbol),
        tvlUsd: Number(market.metrics.ptTvlInUsdFmt),
        apyBase: Number(market.metrics.impliedApy),
        apyReward: Number(rewardApy),
        rewardTokens,
        underlyingTokens: [market.tokens.targetToken.address],
        poolMeta: `Principal Token | Maturity ${formatMaturity(market.maturityTimestamp)}`,
        url: `https://app.napier.finance/user/mint/${market.chainId}/${market.tokens.principalToken.address}/zap/add`,
      };

      return [lpApy, ptApy];
    })
    .flat()
    .filter((p) => utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  return apys;
}

module.exports = {
  timetravel: false,
  apy,
};
