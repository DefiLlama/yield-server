const { request, gql } = require('graphql-request');
const BN = require('bignumber.js');

const ARC_USDC_PAIR_ADDRESS = '0xeab0f20cb5536f07135f9d32c93fc77911317ab6';
const ARC_USDT_PAIR_ADDRESS = '0x309c5c0285d8051f7d4921b108526c173ef43507';
const AMM_SUBGRAPH_URL = 'https://api.archly.fi/subgraphs/name/archly/amm';

const pairsQuery = gql`
  query PairsQuery {
    pairs: pairs(
      first: 1000
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 100 }
    ) {
      address: id
      token0 {
        address: id
        symbol
      }
      token1 {
        address: id
        symbol
      }
      isStable
      reserveUSD
      volumeUSD
      gaugeAddress
    }
  }
`;

const pairQuery = gql`
  query pairQuery($id: String!) {
    pair: pair(id: $id) {
      token0Price
      token1Price
    }
  }
`;

const getPairs = async () => {
  const { pairs } = await request(AMM_SUBGRAPH_URL, pairsQuery, {});
  return pairs;
};


const getArcUsdcPrice = async () => {
  const { pair } = await request(AMM_SUBGRAPH_URL, pairQuery, {
    id: ARC_USDC_PAIR_ADDRESS.toLowerCase(),
  });
  
  return pair != null ? pair.token0Price : 0
}

const getArcUsdtPrice = async () => {
  const { pair } = await request(AMM_SUBGRAPH_URL, pairQuery, {
    id: ARC_USDT_PAIR_ADDRESS.toLowerCase(),
  });
  
  return pair != null ? pair.token1Price : 0
}

const getArcPrice = async () => {
  let usdcPrice = await getArcUsdcPrice()
  let usdtPrice = await getArcUsdtPrice()
  
  return new BN(usdcPrice).plus(usdtPrice).div(2);
};

module.exports = {
  getPairs,
  getArcPrice,
};
