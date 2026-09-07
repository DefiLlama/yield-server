const BigNumber = require('bignumber.js');
const { gql } = require('graphql-request');
const {
  CHAIN,
  MAIN_API,
  assetVariantMeta,
  encodedAssetSegment,
  getConnectionNodes,
  requestGraphql,
  toPercent,
  tokenValueUsd,
} = require('../rujira-staking/common');

const PROJECT = 'rujira-money-market';

const GHOST_VAULTS_QUERY = gql`
  query RujiraGhostVaults($after: String) {
    strategies(
      first: 200
      after: $after
      typenames: ["GhostVault"]
      sortBy: NAME
      sortDir: ASC
    ) {
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          ... on GhostVault {
            address
            asset {
              chain
              metadata {
                decimals
                symbol
              }
              price {
                current
              }
              variants {
                native {
                  denom
                }
              }
            }
            status {
              debtPool {
                size
              }
              debtRate
              depositPool {
                size
              }
              lendRate
            }
          }
        }
      }
    }
  }
`;

const GHOST_CREDIT_QUERY = gql`
  query RujiraGhostCreditVaults {
    ghostCredit {
      vaults {
        borrower {
          available
          current
          limit
          vault {
            address
          }
        }
      }
    }
  }
`;

const getGhostVaults = () =>
  getConnectionNodes(GHOST_VAULTS_QUERY, (data) => data?.strategies);

const getMoneyMarketPools = async () => {
  const [vaults, creditData] = await Promise.all([
    getGhostVaults(),
    requestGraphql(MAIN_API, GHOST_CREDIT_QUERY),
  ]);

  const creditEntries = creditData?.ghostCredit?.vaults;
  if (!Array.isArray(creditEntries)) {
    throw new Error('Rujira GraphQL returned malformed credit vault data');
  }

  const creditVaults = new Map(
    creditEntries
      .map((entry) => entry?.borrower)
      .filter((borrower) => borrower?.vault?.address)
      .map((borrower) => [borrower.vault.address, borrower])
  );

  return vaults
    .map((vault) => {
      const asset = vault?.asset;
      const status = vault?.status;
      const decimals = asset?.metadata?.decimals;
      const symbol = asset?.metadata?.symbol;
      const underlying = asset?.variants?.native?.denom;
      const route = encodedAssetSegment(asset);
      const variantMeta = assetVariantMeta(asset);
      const borrower = creditVaults.get(vault?.address);

      if (
        !vault?.address ||
        !Number.isInteger(decimals) ||
        !symbol ||
        !underlying ||
        !route
      ) {
        return null;
      }

      const totalSupplyUsd = tokenValueUsd(
        status?.depositPool?.size,
        asset?.price?.current,
        decimals
      );
      const totalBorrowUsd = tokenValueUsd(
        status?.debtPool?.size,
        asset?.price?.current,
        decimals
      );
      const apyBase = toPercent(status?.lendRate);
      const apyBaseBorrow = borrower ? toPercent(status?.debtRate) : null;
      const availableBorrowUsd = borrower
        ? tokenValueUsd(borrower.available, asset?.price?.current, decimals)
        : null;

      if (
        totalSupplyUsd === null ||
        totalBorrowUsd === null ||
        totalSupplyUsd < 0 ||
        totalBorrowUsd < 0 ||
        totalSupplyUsd < totalBorrowUsd ||
        apyBase === null ||
        (borrower &&
          (apyBaseBorrow === null ||
            availableBorrowUsd === null ||
            availableBorrowUsd < 0))
      ) {
        return null;
      }

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;
      const token = `x/ghost-vault/${underlying}`;
      const borrowable = Boolean(
        borrower && new BigNumber(String(borrower.available)).isGreaterThan(0)
      );

      return {
        pool: vault.address.toLowerCase(),
        chain: CHAIN,
        project: PROJECT,
        symbol,
        tvlUsd,
        apyBase,
        ...(borrower && {
          apyBaseBorrow,
          availableBorrowUsd,
        }),
        totalSupplyUsd,
        totalBorrowUsd,
        borrowToken: underlying,
        borrowable,
        underlyingTokens: [underlying],
        token,
        poolMeta: variantMeta
          ? `Money Market (${variantMeta.chain})`
          : 'Money Market',
        url: `https://rujira.network/lend/${route}`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8397',
  timetravel: false,
  apy: getMoneyMarketPools,
  url: 'https://rujira.network/lend',
};
