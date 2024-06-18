const { gql, request } = require('graphql-request');
const { mean } = require('lodash');
const utils = require('../utils');

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clvvvr5shxt6301t7b2zn04ii/subgraphs/3jane/1.4.2/gn';

function apyToApr(interest, frequency) {
  return ((1 + interest / 100) ** (1 / frequency) - 1) * frequency * 100;
}

const getNWeekApy = (perf, weekN) => {
  return (
    ((1 +
      (perf[weekN]?.pricePerShare - perf[weekN - 1]?.pricePerShare) /
        perf[weekN - 1]?.pricePerShare) **
      52 -
      1) *
    100
  );
};

const PerfQuery = gql`
  query PerfQuery($id: ID = "") {
    vaultPerformanceUpdates(orderBy: round, where: { vault_: { id: $id } }) {
      pricePerShare
      round
      id
      timestamp
      vault {
        id
        underlyingSymbol
        totalBalance
      }
    }
  }
`;

const VaultsQuery = gql`
  query VaultsQuery {
    vaults {
      id
      name
      underlyingSymbol
      underlyingName
      underlyingDecimals
      underlyingAsset
      totalBalance
      symbol
    }
  }
`;

const PremiumsQuery = gql`
  query PremiumsQuery($id: ID = "") {
    vaultOptionTrades(
      first: 4
      orderBy: timestamp
      orderDirection: desc
      where: { vault_: { id: $id } }
    ) {
      premium
      vault {
        totalBalance
      }
    }
  }
`;

const poolsFunction = async () => {
  const { vaults } = await request(SUBGRAPH_URL, VaultsQuery);

  const { pricesByAddress: prices } = await utils.getPrices(
    vaults.map(({ underlyingAsset }) => underlyingAsset),
    'ethereum'
  );

  const pools = vaults.map(async (vault) => {
    const { vaultOptionTrades } = await request(SUBGRAPH_URL, PremiumsQuery, {
      id: vault.id,
    });
    const avgWeeklyRet = mean(
      vaultOptionTrades.map(
        (trade) => Number(trade.premium) / Number(trade.vault.totalBalance)
      )
    );
    const apyBase = avgWeeklyRet * 52;

    const price = prices[vault.underlyingAsset];

    let symbol = vault.symbol.replace('-THETA', '').slice(1);
    symbol = symbol.includes('yvUSDC') ? 'USDC' : symbol;

    return {
      pool: vault.id,
      chain: 'Ethereum',
      project: '3jane',
      symbol,
      tvlUsd: price * (vault.totalBalance / 10 ** vault.underlyingDecimals),
      apy: apyBase,
      poolMeta: vault.name.includes('Put') ? 'Put-Selling' : 'Covered-Call',
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.3jane.xyz/',
};
