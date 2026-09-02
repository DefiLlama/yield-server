const { gql } = require('graphql-request');
const {
  CHAIN,
  MAIN_API,
  USD_DECIMALS,
  encodedAssetSegment,
  fromFixed,
  requestGraphql,
  toPercent,
} = require('./common');

const PROJECT = 'rujira-staking';
const STAKING_SYMBOLS = new Set(['RUJI', 'BRUNE', 'TCY']);

const STAKING_QUERY = gql`
  query RujiraStakingYield {
    staking {
      pools {
        address
        bondAsset {
          metadata {
            decimals
            symbol
          }
          variants {
            native {
              denom
            }
          }
        }
        receiptAsset {
          metadata {
            decimals
          }
          variants {
            native {
              denom
            }
          }
        }
        status {
          liquidBondShares
          liquidBondSize
          valueUsd
        }
        summary {
          apy {
            status
            value
          }
        }
      }
    }
  }
`;

const getStakingPools = async () => {
  const data = await requestGraphql(MAIN_API, STAKING_QUERY);
  const pools = data?.staking?.pools;
  if (!Array.isArray(pools)) {
    throw new Error('Rujira GraphQL returned malformed staking data');
  }

  return pools
    .map((pool) => {
      const symbol = pool?.bondAsset?.metadata?.symbol;
      const normalizedSymbol = symbol?.toUpperCase();
      if (!STAKING_SYMBOLS.has(normalizedSymbol)) return null;

      const tvlUsd = fromFixed(pool?.status?.valueUsd, USD_DECIMALS);
      const apyBase =
        pool?.summary?.apy?.status === 'AVAILABLE'
          ? toPercent(pool.summary.apy.value)
          : null;
      const underlying = pool?.bondAsset?.variants?.native?.denom;
      const token = pool?.receiptAsset?.variants?.native?.denom;
      const bondDecimals = pool?.bondAsset?.metadata?.decimals;
      const receiptDecimals = pool?.receiptAsset?.metadata?.decimals;
      const liquidBondSize = Number.isInteger(bondDecimals)
        ? fromFixed(pool?.status?.liquidBondSize, bondDecimals)
        : null;
      const liquidBondShares = Number.isInteger(receiptDecimals)
        ? fromFixed(pool?.status?.liquidBondShares, receiptDecimals)
        : null;
      const pricePerShare =
        liquidBondSize !== null &&
        liquidBondShares !== null &&
        liquidBondShares > 0
          ? liquidBondSize / liquidBondShares
          : null;
      const route = encodedAssetSegment({
        chain: 'THOR',
        metadata: { symbol },
      });

      if (
        !pool?.address ||
        !symbol ||
        !underlying ||
        !token ||
        !route ||
        tvlUsd === null ||
        tvlUsd < 0 ||
        apyBase === null
      ) {
        return null;
      }

      return {
        pool: pool.address.toLowerCase(),
        chain: CHAIN,
        project: PROJECT,
        symbol,
        tvlUsd,
        apyBase,
        ...(Number.isFinite(pricePerShare) &&
          pricePerShare > 0 && { pricePerShare }),
        underlyingTokens: [underlying],
        token,
        poolMeta: 'Staking',
        url: `https://rujira.network/stake/${route}`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8394',
  timetravel: false,
  apy: getStakingPools,
  url: 'https://rujira.network/stake',
};
