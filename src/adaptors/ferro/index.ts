const { gql, request } = require('graphql-request');

const sdk = require('@defillama/sdk');

const utils = require('../utils');

const API_URL_3FER: string = 'https://api.ferroprotocol.com/info/api/getApys';
const FERR_SUBGRAPH = 'https://graph.cronoslabs.com/subgraphs/name/ferro/bar';

const SWAP_ADDRESS = '0xe8d13664a42b338f009812fa5a75199a865da5cd';
const STAKING_ADDRESS = '0x6b82eAce10F782487B61C616B623A78c965Fdd88';
const FERRO_TOKEN = '0x39bC1e38c842C60775Ce37566D03B41A7A66C782';

const TOKEN_ADDRESSES = {
  USDT: { address: '0x66e428c3f67a68878562e79A0234c1F83c208770', decimals: 6 },
  USDC: { address: '0xc21223249ca28397b4b6541dffaecc539bff0c59', decimals: 6 },
  DAI: { address: '0xf2001b145b43032aaf5ee2884e456ccd805f677d', decimals: 18 },
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

interface FerPool {
  data: { '3FER': { ferroApr: number } };
}

interface StakingRatio {
  barDailySnapshots: Array<{ ratio: number }>;
}

const getApy = async () => {
  const { data }: FerPool = await utils.getData(API_URL_3FER);
  const prices = await utils.getData(
    `https://api.coingecko.com/api/v3/simple/price?ids=${Object.keys(
      CG_NAMES
    ).join('%2C')}&vs_currencies=usd`
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
      [CG_NAMES[name]]: price.usd,
    }),
    {} as Record<string, number>
  );

  const stakeBalance = await Promise.all(
    Object.entries(TOKEN_ADDRESSES).map(
      async ([_, { address, decimals }]) =>
        (
          await sdk.api.erc20.balanceOf({
            target: address,
            owner: SWAP_ADDRESS,
            chain: 'cronos',
          })
        ).output /
        10 ** decimals
    )
  );

  const ferroStakeBalance =
    (
      await sdk.api.erc20.balanceOf({
        target: FERRO_TOKEN,
        owner: STAKING_ADDRESS,
        chain: 'cronos',
      })
    ).output / 1e18;

  const tvlUsd = Object.entries(TOKEN_ADDRESSES).reduce((acc, token, i) => {
    return acc + mappedPrices[token[0]] * stakeBalance[i];
  }, 0);

  const stablePool = {
    pool: SWAP_ADDRESS,
    symbol: '3FER (DAI, USDC, USDT)',
    chain: utils.formatChain('cronos'),
    project: 'ferro',
    tvlUsd,
    apy: data['3FER'].ferroApr,
    underlyingTokens: Object.values(TOKEN_ADDRESSES).map(
      ({ address }) => address
    ),
    rewardTokens: [FERRO_TOKEN],
  };

  const stakePool = {
    pool: STAKING_ADDRESS,
    symbol: 'FER',
    chain: utils.formatChain('cronos'),
    project: 'ferro',
    tvlUsd: ferroStakeBalance * mappedPrices.FERRO,
    apy: stakingApy * 100,
    underlyingTokens: [FERRO_TOKEN],
    rewardTokens: [FERRO_TOKEN],
  };

  return [stakePool, stablePool];
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
