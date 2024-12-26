const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const utils = require('../utils');

// interface PoolType {
//     pool: string;
//     chain: string;
//     project: string;
//     symbol: string;
//     tvlUsd: number;
//     apyBase?: number;
//     apyReward?: number;
//     rewardTokens?: Array<string>;
//     underlyingTokens?: Array<string>;
//     poolMeta?: string;
//     url?: string;
//     apyBaseBorrow?: number;
//     apyRewardBorrow?: number;
//     totalSupplyUsd?: number;
//     totalBorrowUsd?: number;
//     ltv?: number;
//     apyBaseInception?: number;
// }

const projectSlug = 'prime-protocol';

const primeSubgraphUrl = sdk.graph.modifyEndpoint(
  '6LrvPGTZeMZfEQh4p9DvDBBv4G8cjhLs4v3mdiUycERp'
);

const primeRewardMarketsQuery = gql`
  {
    rewardAssets {
      id
      market {
        address
        totalBorrows
        totalBorrowsUSD
        totalDeposits
        totalDepositsUSD
        rewards {
          rewardAssetAddress
          depositRewardRatePerDay
          borrowRewardRatePerDay
        }
        chainId
      }
    }
  }
`;

const primeAllMarketsQuery = gql`
  {
    markets {
      address
      totalBorrows
      totalBorrowsUSD
      totalDeposits
      totalDepositsUSD
      chainId
    }
  }
`;

const FACTOR_DECIMALS = 8;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const CHAIN_ID_TO_NETWORK = {
  1284: 'moonbeam',
  43114: 'avax',
  42161: 'arbitrum',
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
};

const NETWORK_TO_NETWORK_TOKEN_SYMBOL = {
  moonbeam: 'GLMR',
  avax: 'AVAX',
  arbitrum: 'ETH',
  ethereum: 'ETH',
  bsc: 'BNB',
  polygon: 'MATIC',
};

const PRIME_CONTRACTS = {
  MASTER_VIEW_v1_4_6: {
    address: '0x47ecFB57deD0160d66103A6A201C5f30f7CC7d13',
    abi: {
      calculateAssetTVL:
        'function calculateRawAssetTVL(uint256 chainId, address pToken) view returns (uint256)',
    },
  },
  MASTER_VIEW_v1_10_2: {
    address: '0x30095B6616eB637B72f86E9613cdAcF18C11ED8d',
    abi: {
      getCollateralFactors:
        'function getCollateralFactors(address[] memory underlyings, uint256[] memory chainIds) view returns (uint256[] memory collateralFactors)',
    },
  },
  IRM_ROUTER_v1_10_2: {
    address: '0xd7af46089C5ED25871b770F18a2Ff1C07929abfa',
    abi: {
      borrowInterestRatePerBlock:
        'function borrowInterestRatePerBlock(address loanAsset, uint256 loanAssetChainId) view returns (uint256)',
    },
  },
  PTOKEN_v1_10_2: {
    abi: {
      underlying: 'function underlying() view returns (address)',
    },
  },
  MASTER_VIEW_v1_10_3: {
    address: '0x9Ee26206Bc1143668aD56498b8C7A621bFa27c00',
    abi: {
      supplierInterestRateWithoutTuple:
        'function supplierInterestRateWithoutTuple(uint256 chainId, address loanAsset) view returns (uint256 rate, uint256 factor)',
    },
  },
};

const getTokenPrice = async (tokenAddress, network) => {
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${network}:${tokenAddress}`
  );

  return Number(data.coins[Object.keys(data.coins)[0]].price);
};

const getRewardPool = async (chain, network, market, reward) => {
  const underlyingAddress = (
    await sdk.api.abi.multiCall({
      abi: PRIME_CONTRACTS.PTOKEN_v1_10_2.abi.underlying,
      calls: [market.address].map((address) => ({
        target: address,
      })),
      permitFailure: true,
      chain: network,
    })
  ).output.map((o) => o.output)[0];

  let symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: [underlyingAddress].map((token) => ({
        target: token,
      })),
      permitFailure: true,
      chain: network,
    })
  ).output.map((o) => o.output)[0];

  if (underlyingAddress === ZERO_ADDRESS)
    symbol = NETWORK_TO_NETWORK_TOKEN_SYMBOL[network];

  let underlyingDecimals = Number(
    (
      await sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: [underlyingAddress].map((token) => ({
          target: token,
        })),
        permitFailure: true,
        chain: network,
      })
    ).output.map((o) => o.output)
  );

  if (!underlyingDecimals) underlyingDecimals = 18;

  let rewardDecimals = Number(
    (
      await sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: [reward.rewardAssetAddress].map((r) => ({
          target: r,
        })),
        permitFailure: true,
        chain: network,
      })
    ).output.map((o) => o.output)
  );

  if (!rewardDecimals) rewardDecimals = 18;

  let tvlUsd = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_4_6.abi.calculateAssetTVL,
        calls: [market].map((m) => ({
          params: [m.chainId, m.address],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_4_6.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => o.output)[0]
  );

  tvlUsd *= 10 ** underlyingDecimals / 10 ** 18;

  const apyBase = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_10_3.abi
          .supplierInterestRateWithoutTuple,
        calls: [market].map((m) => ({
          params: [m.chainId, m.address],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_10_3.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => {
      const [rate, factor] = o.output;
      return (Number(rate) * 2336000 * 100) / 10 ** Number(factor);
    })
  );

  const apyBaseBorrow = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.IRM_ROUTER_v1_10_2.abi.borrowInterestRatePerBlock,
        calls: [market].map((m) => ({
          params: [m.address, m.chainId],
          target: PRIME_CONTRACTS.IRM_ROUTER_v1_10_2.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => {
      const borrowInterestRatePerBlock = o.output;
      return (borrowInterestRatePerBlock * 2336000 * 100) / 1e18;
    })
  );

  let ltv = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_10_2.abi.getCollateralFactors,
        calls: [market].map((m) => ({
          params: [[underlyingAddress], [m.chainId]],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_10_2.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => o.output)[0][0]
  );

  ltv /= 10 ** FACTOR_DECIMALS;

  const apyReward =
    ((Number(reward.depositRewardRatePerDay) *
      (await getTokenPrice(reward.rewardAssetAddress, network))) /
      (Number(market.totalDepositsUSD) * 10 ** rewardDecimals)) *
    Number(365) *
    1e2;
  const apyRewardBorrow =
    ((Number(reward.borrowRewardRatePerDay) *
      (await getTokenPrice(reward.rewardAssetAddress, network))) /
      (Number(market.totalBorrowsUSD) * 10 ** rewardDecimals)) *
    Number(365) *
    1e2;

  const totalSupplyUsd = Number(market.totalDepositsUSD);
  const totalBorrowUsd = Number(market.totalBorrowsUSD);

  return {
    pool: `${network.toUpperCase() ?? 'NETWORK_NOT_FOUND'}-${
      market.address ?? 'MARKET_NOT_FOUND'
    }-${reward.rewardAssetAddress ?? 'REWARD_ASSET_ADDRESS_NOT_FOUND'}`,
    chain: network ?? 'CHAIN_NOT_FOUND',
    project: projectSlug ?? 'PROJECT_NOT_FOUND',
    symbol: symbol ?? 'SYMBOL_NOT_FOUND',
    tvlUsd: totalSupplyUsd - totalBorrowUsd ?? 0,
    apyBase: apyBase ?? 0,
    apyBaseBorrow: apyBaseBorrow ?? 0,
    apyReward: apyReward ?? 0,
    apyRewardBorrow: apyRewardBorrow ?? 0,
    rewardTokens: [
      reward.rewardAssetAddress ?? 'REWARD_ASSET_ADDRESS_NOT_FOUND',
    ],
    underlyingTokens: [underlyingAddress ?? 'UNDERLYING_TOKENS_NOT_FOUND'],
    url: 'https://app.primeprotocol.xyz/',
    ltv: ltv ?? 0,
    totalSupplyUsd: totalSupplyUsd ?? 0,
    totalBorrowUsd: totalBorrowUsd ?? 0,
  };
};

const getPool = async (chain, network, market) => {
  const underlyingAddress = (
    await sdk.api.abi.multiCall({
      abi: PRIME_CONTRACTS.PTOKEN_v1_10_2.abi.underlying,
      calls: [market.address].map((address) => ({
        target: address,
      })),
      permitFailure: true,
      chain: network,
    })
  ).output.map((o) => o.output)[0];

  let symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: [underlyingAddress].map((token) => ({
        target: token,
      })),
      permitFailure: true,
      chain: network,
    })
  ).output.map((o) => o.output)[0];

  if (underlyingAddress === ZERO_ADDRESS)
    symbol = NETWORK_TO_NETWORK_TOKEN_SYMBOL[network];

  let underlyingDecimals = Number(
    (
      await sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: [underlyingAddress].map((token) => ({
          target: token,
        })),
        permitFailure: true,
        chain: network,
      })
    ).output.map((o) => o.output)
  );

  if (!underlyingDecimals) underlyingDecimals = 18;

  let tvlUsd = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_4_6.abi.calculateAssetTVL,
        calls: [market].map((m) => ({
          params: [m.chainId, m.address],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_4_6.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => o.output)[0]
  );

  tvlUsd *= 10 ** underlyingDecimals / 10 ** 18;

  const apyBase = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_10_3.abi
          .supplierInterestRateWithoutTuple,
        calls: [market].map((m) => ({
          params: [m.chainId, m.address],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_10_3.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => {
      const [rate, factor] = o.output;
      return (Number(rate) * 2336000 * 100) / 10 ** Number(factor);
    })
  );

  const apyBaseBorrow = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.IRM_ROUTER_v1_10_2.abi.borrowInterestRatePerBlock,
        calls: [market].map((m) => ({
          params: [m.address, m.chainId],
          target: PRIME_CONTRACTS.IRM_ROUTER_v1_10_2.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => {
      const borrowInterestRatePerBlock = o.output;
      return (borrowInterestRatePerBlock * 2336000 * 100) / 1e18;
    })
  );

  let ltv = Number(
    (
      await sdk.api.abi.multiCall({
        abi: PRIME_CONTRACTS.MASTER_VIEW_v1_10_2.abi.getCollateralFactors,
        calls: [market].map((m) => ({
          params: [[underlyingAddress], [m.chainId]],
          target: PRIME_CONTRACTS.MASTER_VIEW_v1_10_2.address,
        })),
        permitFailure: true,
        chain,
      })
    ).output.map((o) => o.output)[0][0]
  );

  ltv /= 10 ** FACTOR_DECIMALS;

  const totalSupplyUsd = Number(market.totalDepositsUSD ?? 0);
  const totalBorrowUsd = Number(market.totalBorrowsUSD ?? 0);

  return {
    pool: `${network.toUpperCase() ?? 'NETWORK_NOT_FOUND'}-${
      market.address ?? 'MARKET_NOT_FOUND'
    }`,
    chain: network ?? 'CHAIN_NOT_FOUND',
    project: projectSlug ?? 'PROJECT_NOT_FOUND',
    symbol: symbol ?? 'SYMBOL_NOT_FOUND',
    tvlUsd: totalSupplyUsd - totalBorrowUsd ?? 0,
    apyBase: apyBase ?? 0,
    apyBaseBorrow: apyBaseBorrow ?? 0,
    underlyingTokens: [underlyingAddress ?? 'UNDERLYING_TOKENS_NOT_FOUND'],
    url: 'https://app.primeprotocol.xyz/',
    ltv: ltv ?? 0,
    totalSupplyUsd: totalSupplyUsd ?? 0,
    totalBorrowUsd: totalBorrowUsd ?? 0,
  };
};

const addRewardMarketPools = async (pools) => {
  const primeRewardMarketsData = await request(
    primeSubgraphUrl,
    primeRewardMarketsQuery
  );

  for (let ra = 0; ra < primeRewardMarketsData.rewardAssets.length; ra++) {
    const market = primeRewardMarketsData.rewardAssets[ra].market;

    for (let r = 0; r < market.rewards.length; r++) {
      console.log(
        `\nmarket(${market.address})-reward(${market.rewards[r].rewardAssetAddress})`
      );

      pools.push(
        await getRewardPool(
          'moonbeam',
          CHAIN_ID_TO_NETWORK[market.chainId],
          market,
          market.rewards[r]
        )
      );
    }
  }
};

const addAllMarketPools = async (pools) => {
  const primeAllMarketsData = await request(
    primeSubgraphUrl,
    primeAllMarketsQuery
  );

  for (let m = 0; m < primeAllMarketsData.markets.length; m++) {
    const market = primeAllMarketsData.markets[m];

    console.log(`\nmarket(${market.address})`);

    let marketAlreadyAdded = false;

    pools.forEach((pool) => {
      if (pool.pool.split('-')[1] == market.address) marketAlreadyAdded = true;
    });

    if (marketAlreadyAdded) continue;

    try {
      pools.push(
        await getPool('moonbeam', CHAIN_ID_TO_NETWORK[market.chainId], market)
      );
    } catch (err) {
      console.log(market);
    }
  }
};

const apy = async () => {
  const pools = [];

  await addRewardMarketPools(pools);
  await addAllMarketPools(pools);

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.primeprotocol.xyz/',
};
