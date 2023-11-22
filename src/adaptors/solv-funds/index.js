const { default: request, gql } = require('graphql-request');
const axios = require('axios');

const poolIds = [
  "0xe037ef7b5f74bf3c988d8ae8ab06ad34643749ba9d217092297241420d600fce",
  "0xc573ea3cb55168e5ebe04b118c4b8a33ba62e86bbe1d1e735a447467795c3bd4",
  "0xf514bf1cefa177ea26156b1d0d0da28da8f88b5eb8ed673ddd2cea5334bb6d6c",
  "0x9119ceb6bcf974578e868ab65ae20c0d546716a6657eb27dc3a6bf113f0b519c",
  "0xf514bf1cefa177ea26156b1d0d0da28da8f88b5eb8ed673ddd2cea5334bb6d6c",
  "0x3f9c68bbb64152799c006c8c505d60edf930f7a45db3b63534ed4c2dae07f7a8",
  "0x504d291d2f4dedf8fa3ac3a342ff3531b8947fa835077c8312fa18da2be4084c",
  "0x370c1ec55ca4a79b54909892f55573603611e0cf34f89a40405e81b8d6a78195"
]

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

const rewardTokenAddress = {
  5000: {
    KTC: "0x779f4e5fb773e17bc8e809f4ef1abb140861159a"
  }
}

const poolsQuery = gql`
  query Pools {
    pools(filter:{
      poolStatus: "Active",
      auditStatus: "Approved"
    }){
      poolsInfo {
        id
        productInfo{
          name
          chainId
          contractInfo{
            contractAddress
          }
        }
        currencyInfo{
          symbol
          currencyAddress
          decimals
        }
        issuerInfo {
          accountInfo{
            username
          }
        }
        poolOrderInfo{
          poolId
        }
        aum
        apy
        additionalRewards
      }
    }
  }
`;

const headers = { 'Authorization': 'solv' }

const poolsFunction = async () => {
  const pools = (await request("https://sft-api.com/graphql", poolsQuery, null, headers)).pools;
  const pricesArray = pools.poolsInfo.map((t) => `${chain[t.productInfo.chainId]}:${t.currencyInfo.currencyAddress}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  let ustPool = [];
  for (const pool of pools.poolsInfo) {
    if (poolIds.indexOf(pool.poolOrderInfo.poolId) == -1) {
      continue
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

    const marketContract = (await request("https://sft-api.com/graphql", marketContractQuery, null, headers)).marketContract;

    let rewardApy = 0;
    let rewardTokens = [];
    JSON.parse(pool.additionalRewards).map(function (item, index) {
      rewardTokens.push(rewardTokenAddress[pool.productInfo.chainId][item.symbol])
      rewardApy += item.apy / 100;
    })

    ustPool.push({
      pool: `${pool.poolOrderInfo.poolId.toLowerCase()}-${chain[pool.productInfo.chainId]}`,
      chain: chain[pool.productInfo.chainId],
      project: `solv-funds`,
      symbol: pool.currencyInfo.symbol,
      underlyingTokens: [pool.currencyInfo.currencyAddress],
      tvlUsd: Number(pool.aum * prices[`${chain[pool.productInfo.chainId]}:${pool.currencyInfo.currencyAddress}`].price),
      apyBase: Number(pool.apy / 100) - Number(marketContract.defautFeeRate),
      apyReward: rewardApy,
      rewardTokens,
      url: `https://app.solv.finance/earn/open-fund/detail/${pool.id}`,
      poolMeta: pool.productInfo.name,
    })
  }

  return ustPool;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.solv.finance/',
};