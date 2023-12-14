const BigNumber = require('bignumber.js');
const mvx = require('@multiversx/sdk-core');
const { default: axios } = require('axios');
const { request } = require('graphql-request');

const { queryPrices, queryMoneyMarkets, queryBoostedRewards, queryRewards } = require('./queries')
const { calcLiquidStakingExchangeRate, calcSimulateExchangeRate } = require('./math');

const API_URL = 'https://mainnet-api.hatom.com/graphql';
const MULTIVERSX_API_URL = 'https://api.multiversx.com/query';
const BOOSTER_CONTRACT_ADDRESS = 'erd1qqqqqqqqqqqqqpgqw4dsh8j9xafw45uwr2f6a48ajvcqey8s78sstvn7xd'

async function getMoneyMarkets() {
  const response = await request(API_URL, queryMoneyMarkets, {});
  return response.queryMoneyMarket.reduce((prev, market) => {
    const symbol = market.underlying.symbol;
    const value = {
      address: market.address,
      decimals: market.underlying.decimals,
      cash: market.stateHistory[0].cash,
      borrows: market.stateHistory[0].borrows,
      reserves: market.stateHistory[0].reserves,
      rate: market.stateHistory[0].supplyRatePerSecond,
      timestamp: market.stateHistory[0].timestamp,
      totalSupply: market.stateHistory[0].totalSupply,
      borrowRatePerSecond: market.stateHistory[0].borrowRatePerSecond,
      supplyAPY: market.stateHistory[0].supplyAPY,
      supplyRatePerSecond: market.stateHistory[0].supplyRatePerSecond,
      totalColateral: market.totalCollateral,
    }
    return {
      ...prev,
      [symbol]: value,
    };
  }, {})
}

async function getTokenPrices() {
  const { queryToken, queryLiquidStaking } =
    await request(API_URL, queryPrices, {});

  const liquidStakingExchangeRate = calcLiquidStakingExchangeRate(
    queryLiquidStaking?.[0]?.state?.cashReserve,
    queryLiquidStaking?.[0]?.state?.totalShares,
  );

  const queryTokenPopulated = queryToken
    .filter(
      ({ dailyPriceHistory, symbol }) =>
        dailyPriceHistory.length > 0 || symbol === 'EGLD',
    )
    .map((tokenItem) => {
      const filteredToken = tokenItem.dailyPriceHistory;

      const priceEgld = filteredToken?.[0]?.quote?.priceInEgld || '0';

      let dailyPriceInEgld = '0';

      if (tokenItem.symbol == 'EGLD') {
        dailyPriceInEgld = '1';
      } else if (tokenItem.symbol == 'SEGLD') {
        dailyPriceInEgld = new BigNumber(1).multipliedBy(liquidStakingExchangeRate).dividedBy(BigNumber.WAD).toString();
      } else {
        dailyPriceInEgld = priceEgld;
      }

      const dailyPriceInUSD = filteredToken?.[0]?.price?.price || '0';

      return {
        ...tokenItem,
        dailyPriceInEgld,
        dailyPriceInUSD,
      };
    });

  const itemEgldInUSD = queryTokenPopulated.find(
    ({ symbol }) => symbol === 'EGLD',
  );
  const itemEgldInUSDC = queryTokenPopulated.find(
    ({ symbol }) => symbol === 'USDC',
  );

  const agregatorEGLDInUSD = new BigNumber(
    itemEgldInUSD?.dailyPriceInUSD || '0',
  )
    .dividedBy(`1e${18}`)
    .toString();

  const priceHistoryEGLDInUSDC =
    new BigNumber(1)
      .dividedBy(itemEgldInUSDC?.dailyPriceInEgld || 0)
      .toString() || '0';

  const usdcPriceInEgld = new BigNumber(agregatorEGLDInUSD).isZero()
    ? priceHistoryEGLDInUSDC
    : agregatorEGLDInUSD;

  const egldInUsdc = usdcPriceInEgld !== '0' ? usdcPriceInEgld : '0';

  return queryTokenPopulated.reduce(
    (prev, { dailyPriceInEgld, dailyPriceInUSD, symbol }) => {
      const priceUSD =
        !new BigNumber(egldInUsdc).isEqualTo('0') ||
          !new BigNumber(dailyPriceInEgld).isEqualTo('0')
          ? new BigNumber(egldInUsdc)
            .multipliedBy(dailyPriceInEgld)
            .toString()
          : '0';

      const value = !new BigNumber(dailyPriceInUSD).isZero()
        ? new BigNumber(dailyPriceInUSD).dividedBy(`1e${18}`).toString()
        : priceUSD;

      return {
        ...prev,
        [symbol]: value,
      };
    },
    {},
  )
}

function getExchangeRates(moneyMarkets) {
  const symbols = Object.keys(moneyMarkets);
  return symbols.reduce(
    (prev, symbol) => {
      const value = calcSimulateExchangeRate({
        cash: moneyMarkets[symbol].cash || '0',
        borrows:
          moneyMarkets[symbol].borrows || '0',
        reserves:
          moneyMarkets[symbol].reserves || '0',
        totalSupply:
          moneyMarkets[symbol].totalSupply || '0',
        rate:
          moneyMarkets[symbol].supplyRatePerSecond || '0',
        timestamp:
          moneyMarkets[symbol].timestamp || new Date().toISOString(),
      })
      return {
        ...prev,
        [symbol]: value
      }
    },
    {},
  );
}

async function getRewardsBatches() {
  const response = await request(API_URL, queryRewards, {});
  return response.queryRewardsBatchState.reduce((prev, batch) => {
    const symbol = batch.moneyMarket.underlying.symbol;
    const value = {
      id: batch.id,
      speed: batch.speed,
      type: batch.type,
      endTime: batch.endTime,
      fullyDistributed: batch.fullyDistributed,
      totalAmount: batch.totalAmount,
      rewardsToken: batch.rewardsToken,
    }
    return {
      ...prev,
      [symbol]: value,
    };
  }, {})
}

async function getBoostedRewards() {
  const response = await request(API_URL, queryBoostedRewards, {});
  return response.queryBoostedRewardsBatchState.reduce((prev, batch) => {
    const symbol = batch.marketBooster.moneyMarket.underlying.symbol;
    const value = {
      speed: batch.speed,
      totalAmount: batch.totalAmount,
      rewardsToken: batch.rewardsToken,
    }
    return {
      ...prev,
      [symbol]: value,
    };
  })
}

async function getTotalBoostedCollateral(moneyMarketAddress) {
  const hexAddress = mvx.Address.fromBech32(moneyMarketAddress).hex()
  const response = await axios.post(MULTIVERSX_API_URL, {
    args: [hexAddress],
    funcName: "getStoredTotalCollateralTokens",
    scAddress: BOOSTER_CONTRACT_ADDRESS
  })
  const base64 = response.data.returnData.at(0)
  const hex = Buffer.from(base64, 'base64').toString('hex')
  const totalCollateral = new BigNumber(hex, 16).toString()
  return totalCollateral
}

async function getBoostedColateralMap(moneyMarkets) {
  const promises = Object.keys(moneyMarkets).map(async (symbol) => {
    const totalCollateral = await getTotalBoostedCollateral(moneyMarkets[symbol].address)
    return {
      [symbol]: totalCollateral
    }
  })
  return Promise.all(promises).then((values) => {
    return values.reduce((prev, value) => {
      return {
        ...prev,
        ...value
      }
    }, {})
  })

}

module.exports = {
  getMoneyMarkets,
  getTokenPrices,
  getExchangeRates,
  getRewardsBatches,
  getBoostedRewards,
  getBoostedColateralMap
}
