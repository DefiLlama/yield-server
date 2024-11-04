const { gql, request } = require('graphql-request');

const sdk = require('@defillama/sdk');

const utils = require('../utils');

const API_URL_3FER: string = 'https://api.ferroprotocol.com/info/api/getApys';
const FERR_SUBGRAPH = 'https://graph.cronoslabs.com/subgraphs/name/ferro/bar';

const STAKING_ADDRESS = '0x6b82eAce10F782487B61C616B623A78c965Fdd88';
const FERRO_TOKEN = '0x39bC1e38c842C60775Ce37566D03B41A7A66C782';

const SWAP_3FER_ADDRESS = '0xe8d13664a42b338f009812fa5a75199a865da5cd';
const TOKEN_3FER_ADDRESSES = {
  USDT: { address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6 },
  USDC: { address: '0xc21223249ca28397b4b6541dffaecc539bff0c59', decimals: 6 },
  DAI: { address: '0xf2001b145b43032aaf5ee2884e456ccd805f677d', decimals: 18 },
};

const SWAP_2FER_ADDRESS = '0xa34c0fe36541fb085677c36b4ff0ccf5fa2b32d6';
const TOKEN_2FER_ADDRESSES = {
  USDC: { address: '0xc21223249ca28397b4b6541dffaecc539bff0c59', decimals: 6 },
  USDT: { address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6 },
};

const stakingQuery = gql`
  query stakingQuery {
    barDailySnapshots(orderBy: date, orderDirection: desc, first: 7) {
      id
      ratio
    }
  }
`;

const CG_NAMES = {
  tether: 'USDT',
  'usd-coin': 'USDC',
  dai: 'DAI',
  ferro: 'FERRO',
};

interface FerApyApiResponse {
  data: {
    '3FER': { baseApr: number; ferroApr: number };
    '2FER': { baseApr: number; ferroApr: number };
  };
}
type FerApyApiData = FerApyApiResponse['data'];

interface StakingRatio {
  barDailySnapshots: Array<{ ratio: number }>;
}

const getPoolApy = async (
  swapAddr: string,
  symbol: string,
  poolMeta: string,
  tokenAddresses: Record<string, { address: string; decimals: number }>,
  mappedPrices: Record<string, number>,
  apyApiData: FerApyApiData
) => {
  const stakeBalance = await Promise.all(
    Object.entries(tokenAddresses).map(
      async ([_, { address, decimals }]) =>
        (
          await sdk.api.erc20.balanceOf({
            target: address,
            owner: swapAddr,
            chain: 'cronos',
          })
        ).output /
        10 ** decimals
    )
  );

  const tvlUsd = Object.entries(tokenAddresses).reduce((acc, token, i) => {
    return acc + mappedPrices[token[0]] * stakeBalance[i];
  }, 0);

  return {
    pool: swapAddr,
    symbol,
    poolMeta,
    chain: utils.formatChain('cronos'),
    project: 'ferro',
    tvlUsd,
    apyBase: apyApiData[poolMeta].baseApr,
    apyReward: apyApiData[poolMeta].ferroApr,
    underlyingTokens: Object.values(tokenAddresses).map(
      ({ address }) => address
    ),
    rewardTokens: [FERRO_TOKEN],
  };
};

const getApy = async () => {
  const { data }: FerApyApiResponse = await utils.getData(API_URL_3FER);

  const priceKeys = Object.keys(CG_NAMES)
    .map((t) => `coingecko:${t}`)
    .join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  const stakingRatio = await request<StakingRatio>(FERR_SUBGRAPH, stakingQuery);
  const stakingApy =
    (1 -
      stakingRatio.barDailySnapshots[6].ratio /
        stakingRatio.barDailySnapshots[0].ratio) *
    52;

  const mappedPrices = Object.entries(prices).reduce(
    (acc, [name, price]: any) => ({
      ...acc,
      [CG_NAMES[name.replace('coingecko:', '')]]: price.price,
    }),
    {} as Record<string, number>
  );

  const ferroStakeBalance =
    (
      await sdk.api.erc20.balanceOf({
        target: FERRO_TOKEN,
        owner: STAKING_ADDRESS,
        chain: 'cronos',
      })
    ).output / 1e18;

  const stakePool = {
    pool: STAKING_ADDRESS,
    symbol: 'FER',
    chain: utils.formatChain('cronos'),
    project: 'ferro',
    tvlUsd: ferroStakeBalance * mappedPrices.FERRO,
    apyReward: stakingApy * 100,
    underlyingTokens: [FERRO_TOKEN],
    rewardTokens: [FERRO_TOKEN],
  };

  const stable3FerPool = await getPoolApy(
    SWAP_3FER_ADDRESS,
    'DAI-USDC-USDT',
    '3FER',
    TOKEN_3FER_ADDRESSES,
    mappedPrices,
    data
  );

  const stable2FerPool = await getPoolApy(
    SWAP_2FER_ADDRESS,
    'USDC-USDT',
    '2FER',
    TOKEN_2FER_ADDRESSES,
    mappedPrices,
    data
  );

  return [stakePool, stable3FerPool, stable2FerPool];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://ferroprotocol.com/#/pools',
};
