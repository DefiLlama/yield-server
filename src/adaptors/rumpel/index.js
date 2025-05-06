const utils = require('../utils');

const RUMPEL_API_URL = 'https://www.app.rumpel.xyz/api/apys';
const RUMPEL_TVL_API_URL =
  'https://point-tokenization-app.vercel.app/api/tvl-by-strategy';
const PROJECT_SLUG = 'rumpel';

const MIN_TVL_USD = 10_000;

// interface Pool {
//     pool: string;
//     chain: string;
//     project: string;
//     symbol: string;
//     tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
//     apyBase?: number;
//     apyReward?: number;
//     rewardTokens?: Array<string>;
//     underlyingTokens?: Array<string>;
//     poolMeta?: string;
//     url?: string;
//     // optional lending protocol specific fields:
//     apyBaseBorrow?: number;
//     apyRewardBorrow?: number;
//     totalSupplyUsd?: number;
//     totalBorrowUsd?: number;
//     ltv?: number; // btw [0, 1]
//   }

const getPools = async () => {
  let apyResponse;
  try {
    apyResponse = await utils.getData(RUMPEL_API_URL);
  } catch (e) {
    console.error('[Rumpel] Failed to fetch APY data from API', e);
    return [];
  }

  if (
    !apyResponse ||
    !apyResponse.strategies ||
    !Array.isArray(apyResponse.strategies)
  ) {
    console.error(
      '[Rumpel] APY API response is missing strategies array or is malformed'
    );
    return [];
  }

  let tvlResponse;
  try {
    tvlResponse = await utils.getData(RUMPEL_TVL_API_URL);
  } catch (e) {
    console.warn(
      '[Rumpel] Failed to fetch TVL data from API, TVL will be 0 for all pools',
      e
    );
    return [];
  }

  const tvlMap = new Map();
  if (tvlResponse && tvlResponse.tvlByStrategy) {
    for (const [strategyName, tvl] of Object.entries(
      tvlResponse.tvlByStrategy
    )) {
      if (tvl !== null && tvl !== undefined) {
        tvlMap.set(strategyName, Number(tvl));
      }
    }
  }

  const pools = apyResponse.strategies.map((strategy) => {
    const tvlUsd = tvlMap.get(strategy.name) || 0;

    const poolData = {
      pool: strategy.name,
      chain: 'Ethereum',
      project: PROJECT_SLUG,
      symbol: strategy.underlyingSymbol,
      tvlUsd: tvlUsd,
      apyBase:
        strategy.totalApy !== undefined && strategy.totalApy !== null
          ? Number(strategy.totalApy)
          : 0,
      apyReward: 0,
      rewardTokens: [],
      underlyingTokens: strategy.underlyingTokens.map((s) => s.address),
      poolMeta: `${strategy.name}${
        strategy.isLendingPosition ? ' (Lending)' : ''
      }`,
      url: 'https://app.rumpel.xyz/?tab=earn',
    };

    if (strategy.isLendingPosition) {
      poolData.ltv =
        strategy.maxLtv !== undefined && strategy.maxLtv !== null
          ? 1 - 1 / Number(strategy.maxLtv)
          : 0;

      let baseBorrowApy = 0;
      if (
        strategy.additionalComponents &&
        Array.isArray(strategy.additionalComponents)
      ) {
        const borrowComponent = strategy.additionalComponents.find(
          (comp) => comp.name === 'Borrow' && comp.negative === true
        );
        if (
          borrowComponent &&
          borrowComponent.apy !== undefined &&
          borrowComponent.apy !== null
        ) {
          baseBorrowApy = Number(borrowComponent.apy);
        }
      }
      poolData.apyBaseBorrow = baseBorrowApy;
      poolData.apyRewardBorrow = 0;
      poolData.totalSupplyUsd = 0;
      poolData.totalBorrowUsd = 0;
    }

    return poolData;
  });

  // Filter pools by minimum TVL
  const filteredPools = pools.filter((pool) => pool.tvlUsd >= MIN_TVL_USD);

  return filteredPools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.rumpel.xyz/',
};
