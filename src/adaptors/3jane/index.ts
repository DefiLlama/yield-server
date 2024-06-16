const { gql, request } = require('graphql-request');
const { mean } = require('lodash');
const utils = require('../utils');

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clvvvr5shxt6301t7b2zn04ii/subgraphs/3jane/1.3.0/gn';

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

const apyChain = async () => {
  const { vaults } = await request(SUBGRAPH_URL, VaultsQuery);
  const vaultPerfs = await Promise.all(
    vaults.map(
      async (vault) =>
        (
          await request(SUBGRAPH_URL, PerfQuery, { id: vault.id })
        ).vaultPerformanceUpdates
    )
  );

  const { pricesByAddress: prices } = await utils.getPrices(
    vaults.map(({ underlyingAsset }) => underlyingAsset),
    'ethereum'
  );

  const pools = vaults.map((vault, i) => {
    const perf = vaultPerfs[i];

    const fee = 0.12;
    const apy = mean(
      [1, 2, 3, 4].map((n) => {
        const nWeekApy = getNWeekApy(perf, perf.length - n - 1);
        return nWeekApy > 0 ? nWeekApy * (1 - fee) : nWeekApy;
      })
    );

    // for 7d IL we use the current weeks performance, if positive -> no IL, otherwise use that
    // value as the IL
    const weekN = perf.length - 1;
    const weeklyPerf =
      (perf[weekN]?.pricePerShare - perf[weekN - 1]?.pricePerShare) /
      perf[weekN - 1]?.pricePerShare;
    const il7d = weeklyPerf > 0 ? null : weeklyPerf;

    const price = prices[vault.underlyingAsset];

    let symbol = vault.symbol.replace('-THETA', '').slice(1);
    symbol = symbol.includes('yvUSDC') ? 'USDC' : symbol;

    return {
      pool: vault.id,
      project: '3jane',
      chain: 'Ethereum',
      symbol,
      tvlUsd: price * (vault.totalBalance / 10 ** vault.underlyingDecimals),
      apyBase: apy,
      underlyingTokens: [vault.underlyingAsset],
      poolMeta: vault.name.includes('Put') ? 'Put-Selling' : 'Covered-Call',
      il7d,
      apyBaseInception:
        ((perf[perf.length - 1]?.pricePerShare - perf[0]?.pricePerShare) /
          perf[0]?.pricePerShare) *
        100,
    };
  });

  return pools;
};

const apy = async () => {
  return await apyChain('Ethereum');
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.3jane.xyz/',
};
