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
        ytFloatingApy
        proName
        address
        pt {
          address
          symbol
        }
        yt {
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

const getApy = async () => {
  const pools = (await request(api, query)).markets.results;

  return pools.map((p) => ({
    pool: p.address,
    chain: utils.formatChain('ethereum'),
    project: 'pendle',
    symbol: utils.formatSymbol(p.proName),
    tvlUsd: p.liquidity.usd,
    apyBase: (p.aggregatedApy - p.pendleApy) * 100,
    apyReward: p.pendleApy * 100,
    rewardTokens: ['0x808507121b80c02388fad14726482e061b8da827'],
    underlyingTokens: [p.sy.underlyingAsset.address],
    poolMeta: `Maturity ${p.pt.symbol.split('-').at(-1)}`,
    url: `https://app.pendle.finance/pro/pools/${p.address}/zap/in`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
