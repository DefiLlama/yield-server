const { request, gql } = require('graphql-request');
const SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/0xleez/xcali-arbitrum';
const DEMETER_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/sperax/demeter-protocol-arbitrum';
const UNISWAP_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/messari/uniswap-v3-arbitrum';
const CAMELOT_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm';
const FarmsQuery = gql`
  query FarmsQuery {
    farms: initFarms(
      first: 1000
      orderBy: timeStampUnix
      orderDirection: desc
    ) {
      id
      poolAddress
      camelotLpToken
      versionName
    }
  }
`;

const uniswapPoolsQuery = gql`
query pools{
uniswapPools: liquidityPools(
  first: 1000
  where: {id: "<ADDRESS>"}
  orderBy: createdBlockNumber
  orderDirection: desc
) {
  id
  name
  symbol
  createdBlockNumber
  cumulativeDepositCount

  lastSnapshotDayID
  totalLiquidityUSD
  activeLiquidityUSD
  totalValueLockedUSD
}
}
`;
const camelotPoolsQuery = gql`
  query FarmsQuery {
    farms: initFarms(
      first: 1000
      orderBy: timeStampUnix
      orderDirection: desc
    ) {
      id
      poolAddress
      camelotLpToken
      versionName
    }
  }
`;

const getDemeterFarms = async () => {
  const { farms } = await request(DEMETER_SUBGRAPH_URL, FarmsQuery, {});
  return farms;
};
const getCamelotPools = async () => {
  const { pools } = await request(CAMELOT_SUBGRAPH_URL, camelotPoolsQuery, {});
  return pools;
};
const getUniswapPools = async () => {
   const { uniswapPools } = await request(UNISWAP_SUBGRAPH_URL, uniswapPoolsQuery.replace('<ADDRESS>',"0x9dc903fe57e53441fd3e0ce8ccbea28c1725ab3d"));
  console.log(uniswapPools);
  return uniswapPools;
};

const separatePools = async () => {
  const getPools = await getDemeterFarms();

  const FilterPools = (pools: any[]) => {
    const uniswapPools = new Set();
    const camelotPools = new Set();
    return pools.filter((pool: any) => {
      const version = pool.versionName;

      if (version.includes('Uniswap')) {
        uniswapPools.add(pool.poolAddress);
        return true;
      } else if (version.includes('Camelot')) {
        camelotPools.add(pool.poolAddress);
        return true;
      } else {
        return false;
      }
    });
  };
  let uniswapPools: any = [];
  let camelotPools: any = [];

  FilterPools(getPools).forEach((pool: any) => {
    if (pool.camelotLpToken != '0x00000000') {
      camelotPools.push(pool.poolAddress);
    } else {
      uniswapPools.push(pool.poolAddress);
    }
  });
  return [uniswapPools, camelotPools];
};

module.exports = {
  getUniswapPools,
};
