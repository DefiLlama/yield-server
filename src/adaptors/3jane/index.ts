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
  query PerfQuery {
    vaultOptionTrades(first: 1, orderBy: timestamp, orderDirection: desc) {
      premium
      vault {
        totalBalance
      }
    }
  }
`;

const simplyApy = async () => {
  const { vaultOptionTrades } = await request(SUBGRAPH_URL, PremiumsQuery);
  const lastTrade = vaultOptionTrades[0];
  const totalPremiums = lastTrade.premium;
  const totalBalance = lastTrade.vault.totalBalance;
  const ret = Number(totalPremiums) / Number(totalBalance);
  return apyToApr(ret, 52);
};

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

  const res = await simplyApy();

  const pools = vaults.map(async (vault, i) => {
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
      res,
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
  return await apyChain();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.3jane.xyz/',
};
