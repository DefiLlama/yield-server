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
  ethereum: 'https://api.thegraph.com/subgraphs/name/premiafinance/premiav2',
  arbitrum:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-arbitrum',
  fantom: 'https://api.thegraph.com/subgraphs/name/premiafinance/premia-fantom',
  optimism:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-optimism',
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
