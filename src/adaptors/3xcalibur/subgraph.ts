const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const XCAL_USDC_PAIR_ADRESS = '0x2Cc6AC1454490AfA83333Fabc84345FaD751285B';
const SUBGRAPH_URL = sdk.graph.modifyEndpoint('J9xPBr2XdBxWvLi2HSiz8hW76HUU91WQ9ztkicCRccDS');

const swapPairsQuery = gql`
  query PairsQuery {
    pairs: swapPairs(
      first: 1000
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 1000 }
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
      stable
      reserveUSD
      volumeUSD
      gaugeAddress
    }
  }
`;

const swapPairQuery = gql`
  query pairQuery($id: String!) {
    pair: swapPair(id: $id) {
      token1Price
    }
  }
`;

const getSwapPairs = async () => {
  const { pairs } = await request(SUBGRAPH_URL, swapPairsQuery, {});
  return pairs;
};

const getXCALPrice = async () => {
  const { pair } = await request(SUBGRAPH_URL, swapPairQuery, {
    id: XCAL_USDC_PAIR_ADRESS.toLowerCase(),
  });
  return pair.token1Price;
};

module.exports = {
  getSwapPairs,
  getXCALPrice,
};
