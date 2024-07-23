const { gql, request } = require('graphql-request');
const { mean } = require('lodash');
const utils = require('../utils');

const SUBGRAPH_URL =
  'https://api.goldsky.com/api/public/project_clvvvr5shxt6301t7b2zn04ii/subgraphs/3jane/1.4.2/gn';

const annualizedWeeklyYield = (yieldPercent: number) => {
  return (yieldPercent + 1) ** 52 - 1;
};

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
    const apyBase = annualizedWeeklyYield(avgWeeklyRet);

    const price = prices[vault.underlyingAsset];

    let symbol = vault.symbol.replace('-THETA', '').slice(1);
    symbol = symbol.includes('yvUSDC') ? 'USDC' : symbol;

    return {
      pool: vault.id,
      project: '3jane',
      chain: 'Ethereum',
      symbol,
      tvlUsd: price * (vault.totalBalance / 10 ** vault.underlyingDecimals),
      apy: apyBase * 100,
      underlyingTokens: [vault.underlyingAsset],
      poolMeta: vault.name.includes('Put') ? 'Put-Selling' : 'Covered-Call',
    };
  });

  return await Promise.all(pools);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.3jane.xyz/vault/eeth-x-c',
};
