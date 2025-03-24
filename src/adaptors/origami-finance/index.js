const { request, gql } = require('graphql-request');
const {
  utils: { getAddress },
} = require('ethers');

const GRAPH_URLS = {
  ethereum: {
    chainId: 1,
    subgraphUrl: 'https://subgraph.satsuma-prod.com/a912521dd162/templedao/origami-mainnet/api',
  },
  arbitrum: {
    chainId: 42161,
    subgraphUrl: 'https://subgraph.satsuma-prod.com/a912521dd162/templedao/origami-arbitrum/api',
  },
  berachain: {
    chainId: 80094,
    subgraphUrl: 'https://subgraph.satsuma-prod.com/a912521dd162/templedao/origami-berachain/api',
  },
}

function getSubgraphQuery() {
  const nowUnix = Math.floor(new Date().getTime() / 1000);
  const averageMetricsTypes = "[AVERAGE_7D_HOURLY]" // ,AVERAGE_1D_HOURLY]"
  return gql`
  {
    investmentVaults {
      id
      symbol
      kinds
      reserveToken {
        id
      }
      latestMetrics: metrics(
        where: {
          metricsType: LATEST
        }
      ) {
        vaultPriceBasedApr
        tvlUSD
      }

      averageMetrics: metrics(
        where: {
         metricsType_in: ${averageMetricsTypes}
        }
      ) {
        yieldSpreadApr
      }

      offchainPoints(
        where: {
          and: [
            {
              or: [
                {end: "0"},
                {end_gte: "${nowUnix}"},
              ],
            },
            {
              or: [
                {start: "0"},
                {start_lte: "${nowUnix}"},
              ],
            },
          ],
        }
        orderBy: sortWeight,
        orderDirection: asc
      ) {
        averageMetrics: metrics(
          where: {
            metricsType_in: ${averageMetricsTypes}
          }
        ) {
          apr
        }
      }
    }
  }`;
}

function vaultApy(chain, chainId, vault) {
  isLeveraged = vault.kinds.includes("Leverage");

  let totalApr = 0;
  if (isLeveraged) {
    const totalPendleBasedAPr = vault.offchainPoints
      .map(op => parseFloat(op.averageMetrics[0].apr))
      .reduce((total, apr) => total + apr, 0);
    totalApr = (parseFloat(vault.averageMetrics[0].yieldSpreadApr) + totalPendleBasedAPr);   
  } else {
    totalApr = vault.latestMetrics[0].vaultPriceBasedApr;
  }

  const result = {
    pool: `${vault.id}-${chain}`,
    chain: chain,
    project: 'origami-finance',
    symbol: vault.symbol,
    tvlUsd: parseFloat(vault.latestMetrics[0].tvlUSD),
    apyBase: (Math.exp(totalApr / 100) - 1) * 100,
    underlyingTokens: [getAddress(vault.reserveToken.id)],
    url: `https://origami.finance/vaults/${chainId}-${getAddress(vault.id)}/info`,
  };
  return result;
}

async function chainApy(chain, config, sgraphQuery) {
  const chainResults = await request(config.subgraphUrl, sgraphQuery);
  return chainResults.investmentVaults.map(vault => vaultApy(chain, config.chainId, vault));
}

const apy = async () => {
  const sgraphQuery = getSubgraphQuery();

  const results = await Promise.all(
    Object.keys(GRAPH_URLS).map(async (chainName) => await chainApy(chainName, GRAPH_URLS[chainName], sgraphQuery))
  );

  return results.flat();
};
  
module.exports = {
  timetravel: false,
  apy,
};
