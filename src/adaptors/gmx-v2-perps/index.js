const { ABI } = require('./abi');
const utils = require('../utils');

const sdk = require('@defillama/sdk');
const { gql, default: request } = require('graphql-request');
const fetch = require('node-fetch');
const { ethers } = require('ethers');
const { sub } = require('date-fns');

const { default: BigNumber } = require('bignumber.js');

const MARKETS_PAGE_SIZE = 100;

const SUBGRAPH_URL = {
  arbitrum: 'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',
  avax: 'https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql',
};

const CONTRACTS = {
  arbitrum: {
    syntheticsReader: '0xf60becbba223EEA9495Da3f606753867eC10d139',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  },
  avax: {
    syntheticsReader: '0x73BA021ACF4Bb6741E82690DdB821e7936050f8C',
    dataStore: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
  },
};

const TICKERS_URL = {
  arbitrum: 'https://arbitrum-api.gmxinfra.io/prices/tickers',
  avax: 'https://avalanche-api.gmxinfra.io/prices/tickers',
};

const WETH = {
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'.toLowerCase(),
  avax: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'.toLowerCase(),
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

const marketsQuery = gql`
  query M($limit: Int!, $offset: Int!) {
    marketInfos(limit: $limit, offset: $offset) {
      id
      marketTokenAddress
      indexTokenAddress
      longTokenAddress
      shortTokenAddress
    }
  }
`;

const marketFeesQuery = (marketAddress) => {
  return `
    _${marketAddress}_lte_start_of_period_: collectedFeesInfos(
      orderBy: timestampGroup_DESC
      where: {
        address_containsInsensitive: "${marketAddress.toLowerCase()}"
        period_eq: "1h"
        timestampGroup_lte: ${Math.floor(
          sub(new Date(), { days: 7 }).valueOf() / 1000
        )}
      }
      limit: 1
    ) {
      cumulativeFeeUsdPerPoolValue
    }
    _${marketAddress}_recent: collectedFeesInfos(
      orderBy: timestampGroup_DESC
      where: {
        address_containsInsensitive: "${marketAddress.toLowerCase()}"
        period_eq: "1h"
      }
      limit: 1
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

const getMarkets = async (chain) => {
  const marketInfos = [];
  let offset = 0;
  while (true) {
    const { marketInfos: batch } = await request(
      SUBGRAPH_URL[chain],
      marketsQuery,
      { limit: MARKETS_PAGE_SIZE, offset }
    );
    if (!batch?.length) break;
    marketInfos.push(...batch);
    if (batch.length < MARKETS_PAGE_SIZE) break;
    offset += MARKETS_PAGE_SIZE;
  }

  if (!marketInfos.length) return [];

  const queryBody = marketInfos.reduce((acc, market) => {
    const marketAddress = (
      market.marketTokenAddress ||
      market.id ||
      ''
    ).toLowerCase();
    if (!marketAddress) return acc;
    return acc + marketFeesQuery(marketAddress);
  }, '');

  const res = queryBody
    ? await request(
        SUBGRAPH_URL[chain],
        gql`query M {
      ${queryBody}
    }`
      )
    : {};

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

  const marketResults = {};

  await Promise.all(
    marketInfos.map(async (market) => {
      const {
        marketTokenAddress,
        longTokenAddress,
        shortTokenAddress,
        indexTokenAddress,
      } = market;

      if (!marketTokenAddress || !longTokenAddress || !shortTokenAddress)
        return null;

      const marketProps = {
        marketToken: marketTokenAddress,
        longToken: longTokenAddress,
        shortToken: shortTokenAddress,
        indexToken: indexTokenAddress,
      };

      const indexTicker =
        tickers[indexTokenAddress?.toLowerCase()] || tickers[WETH[chain]];
      const longTicker = tickers[longTokenAddress?.toLowerCase()];
      const shortTicker = tickers[shortTokenAddress?.toLowerCase()];

      if (!indexTicker || !longTicker || !shortTicker) return null;

      const min = (
        await sdk.api.abi.call({
          target: CONTRACTS[chain].syntheticsReader, // synthetix,
          abi: ABI.find((m) => m.name === 'getMarketTokenPrice'),
          chain: chain,
          params: [
            CONTRACTS[chain].dataStore, //datastore
            marketProps,
            indexTicker,
            longTicker,
            shortTicker,
            MAX_PNL_FACTOR_FOR_DEPOSITS_KEY,
            false,
          ],
        })
      ).output;
      const max = (
        await sdk.api.abi.call({
          target: CONTRACTS[chain].syntheticsReader, // synthetix,
          abi: ABI.find((m) => m.name === 'getMarketTokenPrice'),
          chain: chain,
          params: [
            CONTRACTS[chain].dataStore, //datastore
            marketProps,
            indexTicker,
            longTicker,
            shortTicker,
            MAX_PNL_FACTOR_FOR_DEPOSITS_KEY,
            true,
          ],
        })
      ).output;

      const supply = await sdk.api.erc20.totalSupply({
        target: marketTokenAddress,
        chain: chain,
      });

      const tvl = BigNumber(supply.output || 0)
        .div(1e18)
        .times(BigNumber(min[0] || 0))
        .div(1e30)
        .toNumber();
      if (!Number.isFinite(tvl)) return null;

      marketResults[marketTokenAddress.toLowerCase()] = {
        totalSupply: supply.output,
        minPrice: min[0],
        maxPrice: max[0],
        tvl,
      };
      return res;
    })
  );

  // bonus apr (ARB)
  let rewards;
  let priceARB;
  const ARB = '0x912ce59144191c1204e64559fe8253a0e49e6548';
  const priceKey = `arbitrum:${ARB}`;
  const bonusAPR = await utils.getData(
    'https://arbitrum-api.gmxinfra2.io/incentives/stip?'
  );
  if (bonusAPR?.lp?.isActive) {
    // weekly rewards
    const weeklyRewards = bonusAPR.lp.rewardsPerMarket;
    rewards = Object.keys(weeklyRewards).reduce((acc, k) => {
      acc[k.toLowerCase()] = weeklyRewards[k];
      return acc;
    }, {});

    priceARB = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
  }

  const marketTokensAPRData = marketInfos.map((market) => {
    const marketToken = market.marketTokenAddress;
    const marketAddress = marketToken?.toLowerCase();
    if (!marketAddress) return;

    const marketData = marketResults[marketAddress];
    if (!marketData) return;

    const lteStartOfPeriodFees =
      res[`_${marketAddress}_lte_start_of_period_`] || [];
    const recentFees = res[`_${marketAddress}_recent`] || [];

    const poolValue1 =
      bigNumberify(lteStartOfPeriodFees[0]?.cumulativeFeeUsdPerPoolValue) ||
      BigNumber(0);
    const poolValue2 =
      bigNumberify(recentFees[0]?.cumulativeFeeUsdPerPoolValue) || BigNumber(0);

    if (poolValue1.isNaN() || poolValue2.isNaN()) return;

    if (poolValue2) {
      const incomePercentageForPeriod = poolValue2.minus(poolValue1);

      const yearMultiplier = Math.floor(365 / 7);
      const apr = incomePercentageForPeriod
        .times(yearMultiplier)
        .div(expandDecimals(1, 26));
      const apyBase = apr.div(100).toNumber();
      if (!Number.isFinite(apyBase)) return;

      const longSymbol =
        tickers[market.longTokenAddress.toLowerCase()]?.data?.tokenSymbol;
      const shortSymbol =
        tickers[market.shortTokenAddress.toLowerCase()]?.data?.tokenSymbol;

      const tvlUsd = Number(marketData?.tvl);
      if (!Number.isFinite(tvlUsd)) return;

      let apyReward;
      if (rewards && tvlUsd > 0) {
        const rewardPerYear =
          (rewards[marketAddress.toLowerCase()] / 1e18) *
          52 *
          priceARB.coins[priceKey].price;

        apyReward = (rewardPerYear / tvlUsd) * 100;
      }

      return {
        pool: marketAddress,
        chain: utils.formatChain(chain === 'avax' ? 'avalanche' : chain),
        project: 'gmx-v2-perps',
        symbol: `${longSymbol}-${shortSymbol}`,
        tvlUsd,
        apyBase,
        apyReward: apyReward ?? null,
        underlyingTokens: [market.longTokenAddress, market.shortTokenAddress],
        rewardTokens: apyReward > 0 ? [ARB] : [],
      };
    } else {
      return;
    }
  });
  return marketTokensAPRData.filter(Boolean).filter((i) => utils.keepFinite(i));
};

const apy = async () => {
  return (await Promise.all(['avax', 'arbitrum'].map(getMarkets))).flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.gmx.io/#/earn',
};
