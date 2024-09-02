const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const { default: BigNumber } = require('bignumber.js');
const { getAsset, getTotalSupply } = require('./queries');
const { calculateInterestRate } = require('./helpers');

const endpoint = sdk.graph.modifyEndpoint('6pme7wuvRUDGjuV3zRcgyo6QdKcsHp87tSXZcS1U2QHb');

const query = gql`
  query ($address: String, $strategyId: Int) {
    aggregatedUniswapPriceEntities(
      first: 7
      where: { address: $address, strategyId: $strategyId, interval: "DAILY" }
      orderBy: openTimestamp
      orderDirection: desc
    ) {
      id
      address
      strategyId
      interval
      openPrice
      closePrice
      openTimestamp
      closeTimestamp
    }
  }
`;

const strategies = [
  {
    id: 1,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of WETH-USDC.e 0.05% pool',
    strategyTokenAddress: '0x5037Df4301489C96F17E3E2eBE55bFF909098043',
  },
  {
    id: 2,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of ARB-USDC.e 0.3% pool',
    strategyTokenAddress: '0xBd0a8a71283c92123A3cAE4E7Cb71D410973A9e1',
  },
  {
    id: 3,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of LUSD-USDC.e 0.05% pool',
    strategyTokenAddress: '0xaA25788310eEf9E78e7D601EF727f19BE0944463',
  },
  {
    id: 4,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of WETH-USDC.e 0.05% extra pool',
    strategyTokenAddress: '0xde2781A9eA08E75149EF5EdC9CF97d44F1c05a0c',
  },
];

const pairs = [
  {
    pairId: 1,
    symbol: 'WETH',
    poolMeta: 'Lending Pool for WETH-USDC.e 0.05% LP position',
    tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    decimals: 18,
  },
  {
    pairId: 2,
    symbol: 'ARB',
    poolMeta: 'Lending Pool for ARB-USDC.e 0.3% LP position',
    tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    decimals: 18,
  },
  {
    pairId: 3,
    symbol: 'WBTC',
    poolMeta: 'Lending Pool for WBTC-USDC.e 0.05% LP position',
    tokenAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    decimals: 8,
  },
  {
    pairId: 4,
    symbol: 'GYEN',
    poolMeta: 'Lending Pool for GYEN-USDC.e 0.05% LP position',
    tokenAddress: '0x589d35656641d6aB57A545F08cf473eCD9B6D5F7',
    decimals: 6,
  },
  {
    pairId: 5,
    symbol: 'LUSD',
    poolMeta: 'Lending Pool for LUSD-USDC.e 0.05% LP position',
    tokenAddress: '0x93b346b6BC2548dA6A1E7d98E9a421B42541425b',
    decimals: 18,
  },
  {
    pairId: 6,
    symbol: 'WETH',
    poolMeta: 'Lending Pool for WETH-USDC.e 0.05% narrow range LP position',
    tokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    decimals: 18,
    isEx: true,
  },
];

const ONE = 10 ** 18;
const ZERO = new BigNumber(0);

function getLendingSummary(scaledAssetStatus, irmParams, price, decimals) {
  const supply = new BigNumber(scaledAssetStatus.totalCompoundDeposited)
    .times(scaledAssetStatus.assetScaler)
    .div(ONE)
    .plus(scaledAssetStatus.totalNormalDeposited);
  const borrow = new BigNumber(scaledAssetStatus.totalNormalBorrowed);
  const ur = supply.eq(ZERO) ? ZERO : borrow.times(ONE).div(supply);

  const borrowInterest = calculateInterestRate(irmParams, ur);
  const supplyInterest = supply.eq(ZERO)
    ? ZERO
    : borrowInterest.times(borrow).div(supply);

  const scaler = new BigNumber(10).pow(decimals);

  return {
    supply: supply.times(price).div(scaler).toNumber(),
    borrow: borrow.times(price).div(scaler).toNumber(),
    apy: supplyInterest.div(new BigNumber(10).pow(16)).toNumber(),
  };
}

const lendingApys = async () => {
  const controller = '0x06a61E55d4d4659b1A23C0F20AEdfc013C489829';
  const usdcAddress = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';

  const priceKeys = pairs
    .map((t) => `arbitrum:${t.tokenAddress}`)
    .concat([`arbitrum:${usdcAddress}`])
    .join(',');
  const pricesEthereum = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  return await Promise.all(
    pairs.map(async (pair) => {
      const usdcPrice = pricesEthereum[`arbitrum:${usdcAddress}`]?.price;
      const price = pricesEthereum[`arbitrum:${pair.tokenAddress}`]?.price;

      const pairStatus = await getAsset(controller, pair.pairId);

      const stableSummary = getLendingSummary(
        pairStatus.stablePool.tokenStatus,
        pairStatus.stablePool.irmParams,
        usdcPrice,
        6
      );
      const underlyingSummary = getLendingSummary(
        pairStatus.underlyingPool.tokenStatus,
        pairStatus.underlyingPool.irmParams,
        price,
        pair.decimals
      );

      const stableSupplyToken = pairStatus.stablePool.supplyTokenAddress;
      const underlyingSupplyToken =
        pairStatus.underlyingPool.supplyTokenAddress;

      return [
        {
          pool: `${stableSupplyToken}-arbitrum`,
          chain: 'Arbitrum',
          project: 'predy-v5',
          symbol: 'USDC.e',
          poolMeta: pair.poolMeta,
          tvlUsd: stableSummary.supply - stableSummary.borrow,
          totalSupplyUsd: stableSummary.supply,
          totalBorrowUsd: stableSummary.borrow,
          apyBase: stableSummary.apy,
          url: `https://v5app.predy.finance/arbitrum/trade/usdce/lending/${pair.pairId}`,
        },
        {
          pool: `${underlyingSupplyToken}-arbitrum`,
          chain: 'Arbitrum',
          project: 'predy-v5',
          symbol: pair.symbol,
          poolMeta: pair.poolMeta,
          tvlUsd: underlyingSummary.supply - underlyingSummary.borrow,
          totalSupplyUsd: underlyingSummary.supply,
          totalBorrowUsd: underlyingSummary.borrow,
          apyBase: underlyingSummary.apy,
          url: `https://v5app.predy.finance/arbitrum/trade/usdce/lending/${pair.pairId}`,
        },
      ];
    })
  );
};

function getApr(latest, start) {
  const latestPrice = new BigNumber(latest.closePrice);
  const startPrice = new BigNumber(start.closePrice);
  const apr = latestPrice.times(1000000).div(startPrice).toNumber() - 1000000;
  const span = Number(latest.closeTimestamp) - Number(start.closeTimestamp);

  if (span === 0) {
    return 0;
  }

  return ((apr / 10000) * (60 * 60 * 24 * 365)) / span;
}

const strategyApys = async () => {
  const strategyAddress = '0x247d8E00a2714665a5231f4AB165839d943C1838';

  return await Promise.all(
    strategies.map(async (strategy) => {
      const prices = (
        await request(endpoint, query, {
          address: strategyAddress,
          strategyId: strategy.id,
        })
      ).aggregatedUniswapPriceEntities;

      const apy = getApr(
        prices[0],
        prices[prices.length >= 7 ? 6 : prices.length - 1]
      );

      const totalSupply = await getTotalSupply(strategy.strategyTokenAddress);

      const tvlUsd =
        new BigNumber(totalSupply)
          .times(prices[0].closePrice)
          .div(1e18)
          .toNumber() / 1000000;

      return {
        pool: `${strategy.strategyTokenAddress}-arbitrum`,
        chain: 'Arbitrum',
        project: 'predy-v5',
        symbol: strategy.symbol,
        poolMeta: strategy.poolMeta,
        apyBase: apy,
        tvlUsd,
        url: `https://v5app.predy.finance/arbitrum/trade/usdce/strategy/${strategy.id}`,
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: async () => {
    const lendingApyResults = await lendingApys();
    const strategyApyResults = await strategyApys();

    return lendingApyResults.flat().concat(strategyApyResults);
  },
  url: 'https://appv5.predy.finance',
};
