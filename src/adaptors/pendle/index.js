const utils = require('../utils');
const { request, gql } = require('graphql-request');

const api = 'https://api-v2.pendle.finance/core/graphql';
const chains = {
  1: {
    chainName: "ethereum",
    PENDLE: "0x808507121b80c02388fad14726482e061b8da827",
  },
  42161: {
    chainName: "arbitrum",
    PENDLE: "0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8",
  },
};

const query = (chainId) => gql`
  {
    markets(chainId: ${chainId}) {
      results {
        chainId
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

function poolApys(pools) {
  return pools.map((p) => ({
    pool: p.address,
    chain: utils.formatChain(chains[p.chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.proName),
    tvlUsd: p.liquidity?.usd,
    apyBase: (p.aggregatedApy - p.pendleApy) * 100,
    apyReward: p.pendleApy * 100,
    rewardTokens: [chains[p.chainId].PENDLE],
    underlyingTokens: [p.pt.address, p.sy.address],
    poolMeta: `For LP | Maturity ${p.pt.symbol.split('-').at(-1)}`,
    url: `https://app.pendle.finance/simple/pools/${p.address}`,
  }));
}
function ptApys(pools) {
  return pools.map((p) => ({
    pool: p.pt.address,
    chain: utils.formatChain(chains[p.chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.proName),
    tvlUsd: p.liquidity?.usd,
    apyBase: p.impliedApy * 100,
    underlyingTokens: [p.sy.underlyingAsset.address],
    poolMeta: `For buying ${p.pt.symbol}`,
    url: `https://app.pendle.finance/pro/pools/${p.address}/zap/in`,
  }));
}

async function apy() {
  const pools = (
    await Promise.all(
      Object.keys(chains).map((c) =>
        request(api, query(c)).then((r) => r.markets.results),
      ),
    )
  )
    .flat()
    .filter((p) => p.liquidity != null);
  let results = [poolApys(pools), ptApys(pools)].flat();
  return [poolApys(pools), ptApys(pools)].flat();
}

module.exports = {
  timetravel: false,
  apy,
};
