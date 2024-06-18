const sdk = require('@defillama/sdk');
const { gql, default: request } = require('graphql-request');
const fetch = require('node-fetch');
const { ethers } = require('ethers');
const { sub } = require('date-fns');
const { default: BigNumber } = require('bignumber.js');

const { ABI: GmxDataStoreAbi } = require('./abis/gmxDataStore.js');

const SUBGRAPH_URL = {
  arbitrum:
    'https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api',
};

const CONTRACTS = {
  arbitrum: {
    syntheticsReader: '0xf60becbba223EEA9495Da3f606753867eC10d139',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  },
};

const TICKERS_URL = {
  arbitrum: 'https://arbitrum-api.gmxinfra.io/prices/tickers',
};

const WETH = {
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'.toLowerCase(),
};

function hashData(dataTypes, dataValues) {
  const bytes = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);
  const hash = ethers.utils.keccak256(ethers.utils.arrayify(bytes));

  return hash;
}

function hashString(string) {
  return hashData(['string'], [string]);
}

const MAX_PNL_FACTOR_FOR_DEPOSITS_KEY = hashString(
  'MAX_PNL_FACTOR_FOR_DEPOSITS'
);

const underlyingGmMarkets = [
  '0x70d95587d40a2caf56bd97485ab3eec10bee6336', // WETH/USD
  '0x0ccb4faa6f1f1b30911619f1184082ab4e25813c', // XRP/USD
  '0x6853ea96ff216fab11d2d930ce3c508556a4bdc4', // DOGE/USD
  '0xd9535bb5f58a1a75032416f2dfe7880c30575a41', // LTC/USD
  '0x47c031236e19d024b42f8ae6780e44a573170703', // WBTC/USD
];

const marketsQuery = gql`
  query M {
    marketInfos(where: { id_in: [${underlyingGmMarkets.map((market, _index) => {
      const last = _index === underlyingGmMarkets.length - 1;
      return `"${market}"${last ? '' : ','}`;
    })}] }) {
      id
      marketToken
      indexToken
      longToken
      shortToken
    }
  }
`;

const marketFeesQuery = (marketAddress) => {
  return `
      _${marketAddress}_lte_start_of_period_: collectedMarketFeesInfos(
          orderBy:timestampGroup
          orderDirection:desc
          where: {
            marketAddress: "${marketAddress.toLowerCase()}",
            period: "1h",
            timestampGroup_lte: ${Math.floor(
              sub(new Date(), { days: 7 }).valueOf() / 1000
            )}
          },
          first: 1
      ) {
          cumulativeFeeUsdPerPoolValue
      }
      _${marketAddress}_recent: collectedMarketFeesInfos(
        orderBy: timestampGroup
        orderDirection: desc
        where: {
          marketAddress: "${marketAddress.toLowerCase()}",
          period: "1h"
        },
        first: 1
    ) {
        cumulativeFeeUsdPerPoolValue
    }
  `;
};

function bigNumberify(n) {
  try {
    return BigNumber(n);
  } catch (e) {
    console.error('bigNumberify error', e);
    return undefined;
  }
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).times(bigNumberify(10).pow(decimals));
}

const getGmTokensPrices = async (marketsWithInfos, tickers) => {
  const gmTokensPrices = {};

  await Promise.all(
    marketsWithInfos.map(async (market) => {
      const marketProps = {
        marketToken: market.marketToken,
        longToken: market.longToken,
        shortToken: market.shortToken,
        indexToken: market.indexToken,
      };

      const max = (
        await sdk.api.abi.call({
          target: CONTRACTS['arbitrum'].syntheticsReader, // synthetix,
          abi: GmxDataStoreAbi.find((m) => m.name === 'getMarketTokenPrice'),
          chain: 'arbitrum',
          params: [
            CONTRACTS['arbitrum'].dataStore, //datastore
            marketProps,
            tickers[market.indexToken?.toLowerCase()] ||
              tickers[WETH['arbitrum']],
            tickers[market.longToken?.toLowerCase()],
            tickers[market.shortToken?.toLowerCase()],
            MAX_PNL_FACTOR_FOR_DEPOSITS_KEY,
            true,
          ],
        })
      ).output;

      gmTokensPrices[market.marketToken.toLowerCase()] = {
        gmTokenPrice: max[0] / 1e30,
      };
    })
  );
  return gmTokensPrices;
};

const getGmMarketsForUmami = async () => {
  const chain = 'arbitrum';
  const { marketInfos } = await request(SUBGRAPH_URL[chain], marketsQuery);

  const feesQuery = marketInfos.reduce(
    (acc, market) => acc + marketFeesQuery(market.id),
    ''
  );

  const feesQueryResponse = await request(
    SUBGRAPH_URL[chain],
    gql`query M {
      ${feesQuery}
    }`
  );

  const tickers = (
    await fetch(TICKERS_URL[chain]).then((r) => r.json())
  ).reduce(
    (acc, price) => ({
      ...acc,
      [price?.tokenAddress?.toLowerCase()]: {
        min: price.minPrice,
        max: price.maxPrice,
        data: price,
      },
    }),
    {}
  );

  const gmTokensPrices = await getGmTokensPrices(marketInfos, tickers);

  const marketTokensAPRData = marketInfos.map((market) => {
    const marketAddress = market.id;
    const marketToken = market.marketToken.toLowerCase();
    const gmTokenPrice = gmTokensPrices[marketToken].gmTokenPrice;
    const lteStartOfPeriodFees =
      feesQueryResponse[`_${marketAddress}_lte_start_of_period_`];
    const recentFees = feesQueryResponse[`_${marketAddress}_recent`];

    const poolValue1 =
      bigNumberify(lteStartOfPeriodFees[0]?.cumulativeFeeUsdPerPoolValue) ??
      BigNumber.from(0);
    const poolValue2 = bigNumberify(
      recentFees[0]?.cumulativeFeeUsdPerPoolValue
    );

    if (poolValue2) {
      const incomePercentageForPeriod = poolValue2.minus(poolValue1);

      const yearMultiplier = Math.floor(365 / 7);
      const apr = incomePercentageForPeriod
        .times(yearMultiplier)
        .div(expandDecimals(1, 26));

      const longSymbol =
        tickers[market.longToken.toLowerCase()]?.data?.tokenSymbol;
      const shortSymbol =
        tickers[market.shortToken.toLowerCase()]?.data?.tokenSymbol;

      return {
        pool: marketAddress,
        symbol: `${longSymbol}-${shortSymbol}`,
        apyBase: apr.toString() / 100,
        underlyingTokens: [market.longToken, market.shortToken],
        gmTokenPrice: gmTokenPrice,
      };
    } else {
      return;
    }
  });

  return marketTokensAPRData.filter(Boolean);
};

module.exports = {
  getGmMarketsForUmami,
};
