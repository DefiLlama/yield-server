const { request, gql } = require('graphql-request');
const BN = require('bignumber.js');

const ARC_USDC_PAIR_ADRESS = '0xeab0f20cb5536f07135f9d32c93fc77911317ab6';
const ARC_USDT_PAIR_ADRESS = '0x309c5c0285d8051f7d4921b108526c173ef43507';

const SUBGRAPH_URL =
  'https://api.archly.fi/subgraphs/name/archly/amm';

const swapPairsQuery = gql`
  query PairsQuery {
    pairs: pairs(
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserve0_gt: 0.01, reserve1_gt: 0.01, reserveUSD_gt: 10 }
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

const swapPairQuery = gql`
  query pairQuery($id: String!) {
    pair: pair(id: $id) {
      token0Price
      token1Price
    }
  }
`;

const getSwapPairs = async () => {
  const { pairs } = await request(SUBGRAPH_URL, swapPairsQuery, {});
  return pairs;
};

const getArcPrice = async () => {
  const { usdcPair } = await request(SUBGRAPH_URL, swapPairQuery, {
    id: ARC_USDC_PAIR_ADRESS.toLowerCase(),
  });
  
  const { usdtPair } = await request(SUBGRAPH_URL, swapPairQuery, {
    id: ARC_USDT_PAIR_ADRESS.toLowerCase(),
  });
  
  return new BN(usdcPair.token0Price).plus(usdtPair.token1Price).div(2);
};

module.exports = {
  getSwapPairs,
  getArcPrice,
};
