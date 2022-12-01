const { gql, request } = require('graphql-request');
const { utils } = require('ethers');
const { formatEther } = utils;
const weiToNumber = (value: string) => Number(formatEther(value));

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
}

interface FetchedPool {
  id: string;
  name: string;
  address: string;
  netSizeInUsd: string;
  openInterestInUsd: string;
  underlying: {
    address: string;
    name: string;
  };
  profitLossPercentage: string;
  totalLocked: string;
}

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
        name
      }
      totalVolumeInUsd
      openInterestInUsd
      profitLossPercentage
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

const PREMIA_TOKEN_ADDRESS = {
  ethereum: '0x6399C842dD2bE3dE30BF99Bc7D1bBF6Fa3650E70',
  arbitrum: '0x51fc0f6660482ea73330e414efd7808811a57fa2',
  fantom: '0x3028b4395f98777123c7da327010c40f3c7cc4ef',
  optimism: '0x374ad0f47f4ca39c78e5cc54f1c9e426ff8f231a',
};

function convert(fetchedPool: FetchedPool, chain: string): PoolType {
  const {
    name,
    netSizeInUsd,
    underlying,
    profitLossPercentage,
    id,
    totalLocked,
  } = fetchedPool;

  return {
    chain,
    pool: id,
    poolMeta: name,
    underlyingTokens: [underlying.address],
    rewardTokens: [PREMIA_TOKEN_ADDRESS[chain]],
    tvlUsd: weiToNumber(netSizeInUsd),
    totalSupplyUsd: weiToNumber(netSizeInUsd),
    totalBorrowUsd: weiToNumber(totalLocked),
    project: 'premia',
    symbol: underlying.name,
    apyBase: weiToNumber(profitLossPercentage),
  };
}
async function fetchChainPools(
  url: string,
  chain: string
): Promise<PoolType[]> {
  const { pools } = await request(url, getPoolsQuery);
  return pools.map((pool) => convert(pool, chain));
}

async function poolsFunction(): Promise<PoolType[]> {
  const pools = await Promise.all(
    Object.keys(chainToSubgraph).map(async (chain) =>
      fetchChainPools(chainToSubgraph[chain], chain)
    )
  );

  return pools.flat();
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.premia.finance/options',
};
