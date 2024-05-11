const { default: request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');

const chain = {
  1: 'ethereum',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
  1313161554: 'aurora',
  25: 'cronos',
  324: 'zksync_era',
  5000: 'mantle',
};

const poolsQuery = gql`
  query Pools {
    pools(
      filter: {
        poolStatus: "Active"
        auditStatus: "Approved"
        isUnlisted: false
        saleStatus: ["Upcoming", "Fundraising", "Active"]
      }
    ) {
      poolsInfo {
        id
        productInfo {
          name
          chainId
          contractInfo {
            contractAddress
          }
        }
        currencyInfo {
          symbol
          currencyAddress
          decimals
        }
        issuerInfo {
          accountInfo {
            username
          }
        }
        poolOrderInfo {
          poolId
        }
        aum
        apy
        additionalRewards
      }
    }
  }
`;

const headers = { Authorization: 'solv' };

const poolsFunction = async () => {
  const pools = (
    await request('https://sft-api.com/graphql', poolsQuery, null, headers)
  ).pools;
  const pricesArray = pools.poolsInfo.map(
    (t) => `${chain[t.productInfo.chainId]}:${t.currencyInfo.currencyAddress}`
  );
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  const poolConfiguration = (
    await axios.get(
      `https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/main/pools.json`
    )
  ).data;

  let ustPool = [];
  for (const pool of pools.poolsInfo) {
    if (poolConfiguration.filterOut.indexOf(pool.poolOrderInfo.poolId) !== -1) {
      continue;
    }

    const marketContractQuery = gql`
      query Pools {
        marketContract(chainId:${pool.productInfo.chainId}, contractAddress: "${pool.productInfo.contractInfo.contractAddress}") {
          decimals
          marketContractAddress
          defautFeeRate
        }
      }
    `;

    const marketContract = (
      await request(
        'https://sft-api.com/graphql',
        marketContractQuery,
        null,
        headers
      )
    ).marketContract;

    let rewardApy = 0;
    let rewardTokens = [];
    JSON.parse(pool.additionalRewards).map(function (item, index) {
      if (
        poolConfiguration.rewardTokenAddress[pool.productInfo.chainId]?.[
          item.symbol
        ]
      ) {
        rewardTokens.push(
          poolConfiguration.rewardTokenAddress[pool.productInfo.chainId]?.[
            item.symbol
          ]
        );
        rewardApy += item.apy / 100;
      }
    });

    ustPool.push({
      pool: `${pool.poolOrderInfo.poolId.toLowerCase()}-${
        chain[pool.productInfo.chainId]
      }`,
      chain: chain[pool.productInfo.chainId],
      project: `solv-funds`,
      symbol: pool.currencyInfo.symbol,
      underlyingTokens: [pool.currencyInfo.currencyAddress],
      tvlUsd: Number(
        pool.aum *
          prices[
            `${chain[pool.productInfo.chainId]}:${
              pool.currencyInfo.currencyAddress
            }`
          ]?.price
      ),
      apyBase: Number(pool.apy / 100) - Number(marketContract.defautFeeRate),
      apyReward: rewardApy,
      rewardTokens,
      url: `https://app.solv.finance/earn/open-fund/detail/${pool.id}`,
      poolMeta: pool.productInfo.name,
    });
  }

  return ustPool.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.solv.finance/',
};
