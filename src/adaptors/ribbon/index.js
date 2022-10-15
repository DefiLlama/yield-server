const { gql, request } = require('graphql-request');
const { mean } = require('lodash');
const utils = require('../utils');

const API = {
  Avalanche:
    'https://api.thegraph.com/subgraphs/name/ribbon-finance/ribbon-avax',
  Ethereum: 'https://api.thegraph.com/subgraphs/name/ribbon-finance/ribbon-v2',
};

const getNWeekApy = (perf, weekN) => {
  console;
  return (
    ((1 +
      (perf[weekN].pricePerShare - perf[weekN - 1].pricePerShare) /
        perf[weekN].pricePerShare) **
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
    }
  }
`;

const chainsMap = {
  Avalanche: 'avax',
  Ethereum: 'ethereum',
};

const apyChain = async (chain) => {
  const { vaults } = await request(API[chain], VaultsQuery);
  const vaultPerfs = await Promise.all(
    vaults.map(
      async (vault) =>
        (
          await request(API[chain], PerfQuery, { id: vault.id })
        ).vaultPerformanceUpdates
    )
  );

  const { pricesByAddress: prices } = await utils.getPrices(
    vaults.map(({ underlyingAsset }) => underlyingAsset),
    chainsMap[chain]
  );

  const pools = vaults.map((vault, i) => {
    const perf = vaultPerfs[i];

    const apy = mean(
      [1, 2, 3, 4, 5].map((n) => getNWeekApy(perf, perf.length - n))
    );

    const price = prices[vault.underlyingAsset];

    return {
      pool: vault.id,
      project: 'ribbon',
      chain: chain,
      symbol: vault.underlyingSymbol,
      tvlUsd: price * (vault.totalBalance / 10 ** vault.underlyingDecimals),
      apyBase: apy,
      underlyingTokens: [vault.underlyingAsset],
    };
  });

  return pools;
};

const apy = async () => {
  const chains = Object.keys(chainsMap);

  const pools = await Promise.all(
    chains.map(async (chain) => await apyChain(chain))
  );

  return pools.flat().filter(({ apyBase }) => apyBase > 0);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ribbon.finance/',
};
