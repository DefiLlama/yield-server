const { gql, request } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const MERKL_CHAIN_IDS = {
  ethereum: 1,
  xdai: 100,
  arbitrum: 42161,
  optimism: 10,
  avax: 43114,
  base: 8453,
  hyperliquid: 999,
  plasma: 9745,
  monad: 143,
};

type MerklOpportunity = {
  chainId: number;
  explorerAddress: string;
  campaigns?: {
    params?: {
      whitelist?: string[];
    };
  }[];
  apr: number;
  rewardsRecord?: {
    breakdowns?: {
      token?: {
        address?: string;
      };
    }[];
  };
};

const TOKEN_OPPORTUNITY_URL_BASE =
  'https://api.merkl.xyz/v4/opportunities/?status=LIVE&explorerAddress=';

const query = gql`
  query GetPools($chain: GqlChain!) {
    poolGetPools(
      first: 1000
      where: {
        chainIn: [$chain]
        protocolVersionIn: [3]
        idIn: ["0x430589b4aeee87e21721d657865d942f92d80f2f"]
      }
    ) {
      chain
      symbol
      address
      poolTokens {
        address
        symbol
      }
      dynamicData {
        totalLiquidity
        aprItems {
          type
          apr
          rewardTokenAddress
        }
      }
    }
  }
`;

type BalancerApiPoolData = {
  chain: string;
  symbol: string;
  address: string;
  poolTokens: {
    address: string;
    symbol: string;
  }[];
  dynamicData: {
    totalLiquidity: string;
    aprItems: {
      type: string;
      apr: string;
      rewardTokenAddress?: string;
    }[];
  };
};

type V3Pool = {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number;
  rewardTokens: string[];
  stakingApr: number;
  merklChainId: number;
  underlyingTokens: string[];
  url: string;
};

const getV3Pools = async (
  backendChain: string,
  chainString: string
): Promise<V3Pool[]> => {
  try {
    const { poolGetPools }: { poolGetPools: BalancerApiPoolData[] } =
      await request('https://api-v3.balancer.fi/graphql', query, {
        chain: backendChain,
      });

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

      const baseApr = aprItems
        .filter(
          (item) => item.type === 'IB_YIELD' || item.type === 'SWAP_FEE_24H'
        )
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const stakingApr = aprItems
        .filter((item) => item.type === 'STAKING')
        .reduce((sum, item) => sum + Number(item.apr), 0);

      const rewardTokens = aprItems
        .filter((item) => item.type === 'STAKING' && item.rewardTokenAddress)
        .map((item) => item.rewardTokenAddress.toLowerCase());

      const underlyingTokens = pool.poolTokens
        .map((token) => token.address)
        .filter(Boolean);

      const chainUrl =
        chainString === 'xdai'
          ? 'gnosis'
          : chainString === 'avax'
          ? 'avalanche'
          : chainString;

      return {
        pool: pool.address,
        chain: chainString,
        project: 'balancer-v3',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        rewardTokens,
        stakingApr: stakingApr * 100,
        merklChainId: MERKL_CHAIN_IDS[chainString],
        underlyingTokens: underlyingTokens,
        url: `https://balancer.fi/pools/${chainUrl}/v3/${pool.address}`,
      };
    });
  } catch (error) {
    console.error(
      `Error fetching Balancer V3 pools for ${chainString}:`,
      error
    );
    return [];
  }
};

const filterWhitelistedOpportunities = (opportunities: MerklOpportunity[]) =>
  opportunities.filter((opportunity) =>
    (opportunity.campaigns || []).every(
      (campaign) => !(campaign?.params?.whitelist || []).length
    )
  );

const getTokenOpportunityRewardsMap = async (
  pools: PoolsWithMerklReward[]
): Promise<Record<string, string[]>> => {
  const keys = [
    ...new Set(
      pools.flatMap((pool) =>
        (pool.underlyingTokens || []).map(
          (token) => `${pool.merklChainId}:${token.toLowerCase()}`
        )
      )
    ),
  ].filter((key) => !key.startsWith('undefined:'));

  const rewardsMap = {};
  const batchSize = 10;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (key) => {
        const [chainId, tokenAddress] = key.split(':');
        try {
          const opportunities: MerklOpportunity[] = await utils.getData(
            `${TOKEN_OPPORTUNITY_URL_BASE}${tokenAddress}`
          );
          const filtered = filterWhitelistedOpportunities(opportunities).filter(
            (opportunity) =>
              Number(opportunity.chainId) === Number(chainId) &&
              opportunity.explorerAddress?.toLowerCase() === tokenAddress
          );

          const rewardTokens = [
            ...new Set(
              filtered.flatMap((opportunity) =>
                (opportunity.rewardsRecord?.breakdowns || [])
                  .map((breakdown) => breakdown?.token?.address?.toLowerCase())
                  .filter(Boolean)
              )
            ),
          ];

          return { key, rewardTokens };
        } catch (error) {
          console.error(
            `Error fetching Merkl token opportunities for ${key}:`,
            error
          );
          return { key, rewardTokens: [] };
        }
      })
    );

    batchResults.forEach(({ key, rewardTokens }) => {
      rewardsMap[key] = rewardTokens;
    });
  }

  return rewardsMap;
};

const addTokenOpportunityRewards = async (
  pools: PoolsWithMerklReward[]
): Promise<PoolsWithMerklReward[]> => {
  const rewardsMap = await getTokenOpportunityRewardsMap(pools);

  return pools.map((pool) => {
    const tokenRewardTokens = [
      ...new Set(
        (pool.underlyingTokens || []).flatMap((tokenAddress) => {
          const key = `${pool.merklChainId}:${tokenAddress.toLowerCase()}`;
          return rewardsMap[key] || [];
        })
      ),
    ];

    if (!tokenRewardTokens.length) return pool;

    return {
      ...pool,
      // pool.apyReward = TODO we also need to add the APY of the token opportunity.
      rewardTokens: [
        ...new Set([...(pool.rewardTokens || []), ...tokenRewardTokens]),
      ],
    };
  });
};

type PoolsWithMerklReward = V3Pool & { apyReward?: number };

const poolsFunction = async () => {
  const [
    // mainnetPools,
    // gnosisPools,
    // arbitrumPools,
    // optimismPools,
    // avalanchePools,
    // basePools,
    // hyperliquidPools,
    // plasmaPools,
    monadPools,
  ] = await Promise.all([
    // getV3Pools('MAINNET', 'ethereum'),
    // getV3Pools('GNOSIS', 'xdai'),
    // getV3Pools('ARBITRUM', 'arbitrum'),
    // getV3Pools('OPTIMISM', 'optimism'),
    // getV3Pools('AVALANCHE', 'avax'),
    // getV3Pools('BASE', 'base'),
    // getV3Pools('HYPEREVM', 'hyperliquid'),
    // getV3Pools('PLASMA', 'plasma'),
    getV3Pools('MONAD', 'monad'),
  ]);

  const pools = [
    // ...mainnetPools,
    // ...gnosisPools,
    // ...arbitrumPools,
    // ...optimismPools,
    // ...avalanchePools,
    // ...basePools,
    // ...hyperliquidPools,
    // ...plasmaPools,
    ...monadPools,
  ];

  // Add merkl reward APY and reward tokens to pools. This only includes pools that target Balancer pools directly.
  const poolsWithMerkl: PoolsWithMerklReward[] = await addMerklRewardApy(
    pools,
    'balancer',
    (pool) => pool.pool
  );

  // Boosted pools might receive additional rewards from forwarded Merkl token opportunities, so we need to add those as well.
  // const poolsWithTokenOpRewards = await addTokenOpportunityRewards(
  //   poolsWithMerkl
  // );

  return poolsWithMerkl.map((pool) => {
    const apyReward = (pool.stakingApr || 0) + (pool.apyReward || 0);
    const {
      stakingApr: _stakingApr,
      merklChainId: _merklChainId,
      ...rest
    } = pool;
    return {
      ...rest,
      chain: utils.formatChain(rest.chain),
      apyReward,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://balancer.fi/pools',
};
