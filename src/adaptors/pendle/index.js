const utils = require('../utils');
const logger = require("../../utils/logger");
const axios = require('axios');

const chains = {
  1: {
    chainName: 'ethereum',
    chainSlug: 'ethereum',
    PENDLE: '0x808507121b80c02388fad14726482e061b8da827',
  },
  42161: {
    chainName: 'arbitrum',
    chainSlug: 'arbitrum',
    PENDLE: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
  },
  56: {
    chainName: 'bsc',
    chainSlug: 'bnbchain',
    PENDLE: '0xb3ed0a426155b79b898849803e3b36552f7ed507',
  },
  10: {
    chainName: 'optimism',
    chainSlug: 'optimism',
    PENDLE: '0xBC7B1Ff1c6989f006a1185318eD4E7b5796e66E1',
  },
  146: {
    chainName: 'sonic',
    chainSlug: 'sonic',
    PENDLE: '0xf1ef7d2d4c0c881cd634481e0586ed5d2871a74b',
  },
  8453: {
    chainName: 'base',
    chainSlug: 'base',
    PENDLE: '0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e',
  },
  5000: {
    chainName: 'mantle',
    chainSlug: 'mantle',
    PENDLE: '0xd27b18915e7acc8fd6ac75db6766a80f8d2f5729',
  },
};

function splitId(id) {
  const [chainId, address] = id.split('-');
  return { chainId, address };
}

function expiryToText(dateIso) {
  return new Date(dateIso)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/ /g, '')
    .toUpperCase();
}

function poolApys(chainId, pools) {
  return pools.map((p) => ({
    pool: p.address,
    chain: utils.formatChain(chains[chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.name),
    tvlUsd: p.details.liquidity,
    apyBase: (p.details.aggregatedApy - p.details.pendleApy) * 100,
    apyReward: p.details.pendleApy * 100,
    rewardTokens: [chains[chainId].PENDLE],
    underlyingTokens: [splitId(p.pt).address, splitId(p.sy).address],
    poolMeta: `LP-${p.name}-${expiryToText(p.expiry)}`,
    url: `https://app.pendle.finance/trade/pools/${p.address}/zap/in?chain=${chains[chainId].chainSlug}`,
  }));
}

function ptApys(chainId, pools) {
  return pools.map((p) => ({
    pool: splitId(p.pt).address,
    chain: utils.formatChain(chains[chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.name),
    tvlUsd: p.details.liquidity,
    apyBase: p.details.impliedApy * 100,
    underlyingTokens: [splitId(p.underlyingAsset).address],
    poolMeta: `PT-${p.name}-${expiryToText(p.expiry)}`,
    url: `https://app.pendle.finance/trade/markets/${p.address}/swap?view=pt&chain=${chains[chainId].chainSlug}&py=output`,
  }));
}

async function apy() {
  const date = new Date();
  const poolsFiltered = [];

  await Promise.all(
    Object.keys(chains).map(async (chainId) => {
      let pools = (
        await axios.get(
          `https://api-v2.pendle.finance/core/v1/${chainId}/markets/active`
        )
      ).data.markets;
      pools = [poolApys(chainId, pools), ptApys(chainId, pools)]
        .flat()
        .sort((a, b) => b.tvlUsd - a.tvlUsd);

      const unique = new Set();
      for (const p of pools) {
        if (unique.has(p.pool)) continue;
        poolsFiltered.push(p);
        unique.add(p.pool);
      }
    })
  );

  return poolsFiltered;
}

module.exports = {
  timetravel: false,
  apy,
};
