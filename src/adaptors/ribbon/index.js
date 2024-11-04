const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const { mean } = require('lodash');
const utils = require('../utils');

const API = {
  Avalanche: sdk.graph.modifyEndpoint('AmJzFkqot9NjxPCRLK8yXopYt3rtS736ZEX2zEFg7Tz2'),
  Ethereum: sdk.graph.modifyEndpoint('3GhHcRwF6yH7WXGcJJvac9B5MHPuoXhS9uxc49TPqLf6'),
};

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
    // remove deprecated APE pool
    if (vault.id === '0xc0cf10dd710aefb209d9dc67bc746510ffd98a53') return {};
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
      project: 'ribbon',
      chain: chain,
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
  const chains = Object.keys(chainsMap);

  const pools = await Promise.all(
    chains.map(async (chain) => await apyChain(chain))
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ribbon.finance/',
};
