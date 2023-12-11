import { get } from 'lodash';

const { request, gql } = require('graphql-request');
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
  query pools {
    uniswapPools: liquidityPools(
      first: 1000
      where: { id: "<ADDRESS>" }
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
  query camelotQuery {
    camelotPools: pairs(first: 100, where: { id: "<ADDRESS>" }) {
      id
      feeUSD
      reserve0
      reserve1
      reserveUSD
      isStable
      token0 {
        symbol
        name
      }
      token1 {
        symbol
        name
      }
    }
  }
`;

const getDemeterFarms = async () => {
  const { farms } = await request(DEMETER_SUBGRAPH_URL, FarmsQuery, {});
  return farms;
};
const getCamelotPools = async () => {
  const { camelotPools } = await request(
    CAMELOT_SUBGRAPH_URL,
    camelotPoolsQuery,
    {}
  );
  // const { camelotPools } = await request(CAMELOT_SUBGRAPH_URL, camelotPoolsQuery.replace('<ADDRESS>',address));
  return camelotPools;
};
const dataFiltred = async () => {
  try {
    const getUniswapPools = async (address) => {
      //  const { uniswapPools } = await request(UNISWAP_SUBGRAPH_URL, uniswapPoolsQuery.replace('<ADDRESS>',"0x9dc903fe57e53441fd3e0ce8ccbea28c1725ab3d"));
      const { uniswapPools } = await request(
        UNISWAP_SUBGRAPH_URL,
        uniswapPoolsQuery.replace('<ADDRESS>', address)
      );
      return uniswapPools;
    };

    let tvl: any;
    let symbol: any;
    const getData = await getUniswapPools(
      '0x854c4ee45b2379446c4bf1c2f872c26aa8d95d8d'
    );
    symbol = getData[0].symbol;
    tvl = getData[0].totalValueLockedUSD;
    return [symbol,tvl];
  } catch (e) {
    console.log('arbitrum', e);
    return [];
  }
};

const poolsFiltred = async () => {
  const uniInfos = await Promise.all([separatePools()]);
  return uniInfos;
};

const separatePools = async () => {
  try {
    const getPools = await getDemeterFarms();

    const FilterPools = (pools: any[]) => {
      const uniswapPools = new Set();
      const camelotPools = new Set();
      const camelotData = new Set();
      return pools.filter((pool: any) => {
        const version = pool.versionName;

        if (version.includes('Uniswap')) {
          uniswapPools.add(pool.poolAddress);
          return true;
        } else if (version.includes('Camelot')) {
          camelotPools.add(pool.poolAddress);
          const camelot = getCamelotPools();
          camelotData.add(camelot);
          console.log(camelot);
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
        console.log(getCamelotPools());
      } else {
        uniswapPools.push(pool.poolAddress);
      }
    });
    return [uniswapPools, camelotPools];
  } catch (e) {
    console.log('arbitrum', e);
    return [];
  }
};
module.exports = {
  dataFiltred,
};
