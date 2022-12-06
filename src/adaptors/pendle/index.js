const utils = require('../utils');
const { request, gql } = require('graphql-request');

const api = 'https://api-v2.pendle.finance/core/graphql';
const query = gql`
  {
    markets(chainId: 1) {
      results {
        aggregatedApy
        pendleApy
        impliedApy
        proName
        address
        pt {
          address
          symbol
        }
        sy {
          address
          underlyingAsset {
            address
            symbol
          }
        }
        liquidity {
          usd
        }
      }
    }
  }
`;

async function poolApys(pools) {
  return pools.map((p) => ({
    pool: p.address,
    chain: utils.formatChain('ethereum'),
    project: 'pendle',
    symbol: utils.formatSymbol(p.proName),
    tvlUsd: p.liquidity.usd,
    apyBase: (p.aggregatedApy - p.pendleApy) * 100,
    apyReward: p.pendleApy * 100,
    rewardTokens: ['0x808507121b80c02388fad14726482e061b8da827'],
    underlyingTokens: [p.pt.address, p.sy.address],
    poolMeta: `For LP | Maturity ${p.pt.symbol.split('-').at(-1)}`,
    url: `https://app.pendle.finance/simple/pools/${p.address}`,
  }));
}
async function ptApys(pools) {
  return pools.map((p) => ({
    pool: p.pt.address,
    chain: utils.formatChain('ethereum'),
    project: 'pendle',
    symbol: utils.formatSymbol(p.proName),
    tvlUsd: p.liquidity.usd,
    apyBase: p.impliedApy * 100,
    underlyingTokens: [p.sy.underlyingAsset.address],
    poolMeta: `For buying ${p.pt.symbol}`,
    url: `https://app.pendle.finance/pro/pools/${p.address}/zap/in`,
  }));
}

async function apy() {
  const pools = (await request(api, query)).markets.results;
  let results = await Promise.all([poolApys(pools), ptApys(pools)]);
  return results.flat();
}

module.exports = {
  timetravel: false,
  apy,
};
