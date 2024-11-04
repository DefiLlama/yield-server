const { gql } = require("graphql-request");
const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/59130/v3alb/version/latest';

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const query = gql`
  {
    pools(first: 100, where: {totalValueLockedUSD_gt: 1000}, orderBy:totalValueLockedUSD, orderDirection: desc) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
      feeProtocol
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const fetchPoolsFromSubgraph = async () => {
  const query = `
    query {
      pools(first: 100, where: {totalValueLockedUSD_gt: 1000}) {
        id
        token0 {
          id
        }
        token1 {
          id
        }
        liquidity
        totalValueLockedUSD
        volumeUSD
      }
    }
  `;

  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const { data } = await response.json();
    return data.pools;
  } catch (err) {
    console.log('Error fetching pools:', err);
    return [];
  }
};

const averageArray = (dataToCalculate) => {
  let data = [...dataToCalculate];
  if (data.length > 3) {
    data = data.sort((a, b) => a - b).slice(1, data.length - 1);
  }
  return data.reduce((result, val) => result + val, 0) / data.length;
};

const fetchPoolAvgInfo = async (address) => {
  const query = `
    query getVolume($days: Int!, $address: String!) {
      poolDayDatas(first: $days, orderBy: date, orderDirection: desc, where: { pool: $address }) {
        volumeUSD
        tvlUSD
        feesUSD
        protocolFeesUSD
      }
    }
  `;
  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { days: 7, address: address.toLowerCase() } }),
    });
    const { data } = await response.json();
    const poolDayDatas = data.poolDayDatas;

    const volumes = poolDayDatas.map((d) => Number(d.volumeUSD));

    return {
      volumeUSD: averageArray(volumes),
    };
  } catch (err) {
    console.log('Error fetching pool volume info:', err);
    return { volumeUSD: 0 };
  }
};

const fetchTokenPricesFromSubgraph = async () => {
  const query = `
    query {
      tokens(first: 100) {
        id
        name
        symbol
        derivedUSD
      }
    }
  `;

  try {
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const { data } = await response.json();
    
    const tokenPrices = {};
    data.tokens.forEach((token) => {
      tokenPrices[token.id?.toLowerCase()] = {
        symbol: token.symbol,
        derivedUSD: parseFloat(token.derivedUSD)
      };
    });
    return tokenPrices;
  } catch (err) {
    console.log('Error fetching token prices:', err);
    return {};
  }
};

module.exports = {
  fetchPoolsFromSubgraph,
  fetchTokenPricesFromSubgraph,
  fetchPoolAvgInfo,
  queryPrior,
  query,
  SUBGRAPH_URL,
};
