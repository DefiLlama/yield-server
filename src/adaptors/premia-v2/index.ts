const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const { utils } = require('ethers');
const { PREMIA_TOKEN_ADDRESS } = require('./addresses');
const { convert, getChainRewardData } = require('./utils');
const { getPrices } = require('../utils');

const getPoolsQuery = gql`
  query MyQuery {
    pools {
      address
      annualPercentageReturn
      averageReturn
      netSizeInUsd
      openInterest
      totalLocked
      name
      id
      underlying {
        address
        symbol
        decimals
      }
      totalVolumeInUsd
      openInterestInUsd
      profitLossPercentage
      optionType
      base {
        address
        symbol
        decimals
      }
    }
  }
`;

const chainToSubgraph = {
  ethereum: sdk.graph.modifyEndpoint('CqWfkgRsJRrQ5vWq9tkEr68F5nvbAg63ati5SVJQLjK8'),
  arbitrum: sdk.graph.modifyEndpoint('3o6rxHKuXZdy8jFifV99gMUe8FaVUL8w8bDTNdc4zyYg'),
  fantom: sdk.graph.modifyEndpoint('5ahtXN7DVTwnPuDhWqgJWvEeAEP3JD7h2kD1Kpe67VuW'),
  optimism: sdk.graph.modifyEndpoint('8wMexS8BB1cXWYu2V8cPHURGXSRGDBhshnU9nTiSkXQ7'),
};

interface PoolType {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  ltv?: number;
  apyBaseInception?: number;
}

async function fetchChainPools(
  url: string,
  chain: string,
  price: number
): Promise<PoolType[]> {
  const { pools } = await request(url, getPoolsQuery);
  const chainRewardData = await getChainRewardData(chain);
  return await Promise.all(
    pools.map(
      async (pool) => await convert(pool, chain, chainRewardData, price)
    )
  );
}

async function getPREMIAPrice() {
  const PREMIA_PRICE = await getPrices(
    [PREMIA_TOKEN_ADDRESS['ethereum']],
    'ethereum'
  );
  return PREMIA_PRICE.pricesBySymbol.premia;
}

async function poolsFunction(): Promise<PoolType[]> {
  const PRICE = await getPREMIAPrice();
  const pools = await Promise.all(
    Object.keys(chainToSubgraph).map(async (chain) =>
      fetchChainPools(chainToSubgraph[chain], chain, PRICE)
    )
  );

  return pools.flat();
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.premia.finance/options',
};
