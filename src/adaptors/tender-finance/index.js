const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const gmdAbi = require('./abis/gmd.json');
const { comptrollerAbi, ercDelegator } = require('./abis/tender');
const utils = require('../utils');
const gmxAbi = require('./abis/gmx.json');

const COMPTROLLER_ADDRESS = '0xeed247Ba513A8D6f78BE9318399f5eD1a4808F8e';
const CHAIN = 'arbitrum';
const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'compSupplySpeeds';
const REWARD_SPEED_BORROW = 'compBorrowSpeeds';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 86400 / 12;
const PROJECT_NAME = 'tender-finance';

async function getGlpApy() {
  const arbitrumGmxAddress = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a';
  const arbitrumGlpManagerAddress =
    '0x321F653eED006AD1C29D174e17d96351BDe22649';
  const arbitrumFeeGmxTrackerAddress =
    '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
  const arbitrumInflationGmxTrackerAddress =
    '0x908C4D94D34924765f1eDc22A1DD098397c59dD4';
  const arbitrumFeeGlpTrackerAddress =
    '0x4e971a87900b931fF39d1Aad67697F49835400b6';
  const arbitrumInflationGlpTrackerAddress =
    '0x1aDDD80E6039594eE970E5872D247bf0414C8903';
  const secondsPerYear = 31536000;

  async function getAdjustedAmount(pTarget, pChain, pgmxAbi, pParams = []) {
    let decimals = await sdk.api.abi.call({
      target: pTarget,
      abi: 'erc20:decimals',
      chain: pChain,
      permitFailure: true,
    });
    let supply = await sdk.api.abi.call({
      target: pTarget,
      abi: pgmxAbi,
      chain: pChain,
      params: pParams,
      permitFailure: true,
    });

    return pgmxAbi == gmxAbi['tokensPerInterval']
      ? supply.output * 10 ** -decimals.output * secondsPerYear
      : supply.output * 10 ** -decimals.output;
  }
  async function getGlpTvl(pChain) {
    let tvl = await sdk.api.abi.call({
      target:
        pChain == 'arbitrum'
          ? arbitrumGlpManagerAddress
          : avalancheGlpManagerAddress,
      abi: gmxAbi['getAumInUsdg'],
      chain: pChain,
      params: [false],
      permitFailure: true,
    });

    return tvl.output * 10 ** -18;
  }

  async function glpApyBase(
    pChain,
    pTvl,
    pInflationTrackerAddress,
    pFeeGlp,
    pInflationGlp,
    pPriceData
  ) {
    const yearlyFeeGlp = pFeeGlp * pPriceData['coingecko:ethereum'].price;
    const yearlyInflationGlp =
      pInflationGlp * pPriceData['coingecko:gmx'].price;
    const apyFee = (yearlyFeeGlp / pTvl) * 100;
    const apyInflation = (yearlyInflationGlp / pTvl) * 100;
    const chainString = pChain === 'avax' ? 'avalanche' : pChain;

    return apyFee;
  }

  const arbitrumFeeGlp = await getAdjustedAmount(
    arbitrumFeeGlpTrackerAddress,
    'arbitrum',
    gmxAbi['tokensPerInterval']
  );
  const arbitrumInflationGlp = await getAdjustedAmount(
    arbitrumInflationGlpTrackerAddress,
    'arbitrum',
    gmxAbi['tokensPerInterval']
  );
  const priceKeys = ['gmx', 'ethereum'].map((t) => `coingecko:${t}`).join(',');
  const { coins: priceData } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  return await glpApyBase(
    'arbitrum',
    await getGlpTvl('arbitrum'),
    arbitrumInflationGlpTrackerAddress,
    arbitrumFeeGlp,
    arbitrumInflationGlp,
    priceData
  );
}

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WETH',
  address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'.toLowerCase(),
};

const PROTOCOL_TOKEN = {
  decimals: 18,
  symbol: 'TND',
  address: '0xC47D9753F3b32aA9548a7C3F30b6aEc3B2d2798C'.toLowerCase(),
};

const PROTOCOL_ESTOKEN = {
  decimals: 18,
  symbol: 'esTND',
  address: '0xff9bD42211F12e2de6599725895F37b4cE654ab2'.toLowerCase(),
};

const GMD_VAULT = '0x8080B5cE6dfb49a6B86370d6982B3e2A86FBBb08';

const GMD_IDS = [0, 1, 2, 4];

const GMD_TOKENS = {
  gmdUSDC: {
    underlying: '0x3DB4B7DA67dd5aF61Cb9b3C70501B1BdB24b2C22',
  },
  gmdETH: {
    underlying: '0x1E95A37Be8A17328fbf4b25b9ce3cE81e271BeB3',
  },
  gmdBTC: {
    underlying: '0x147FF11D9B9Ae284c271B2fAaE7068f4CA9BB619',
  },
  gmdUSDT: {
    underlying: '0x34101Fe647ba02238256b5C5A58AeAa2e532A049',
  },
};

const getGmdInfo = async () => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: [0, 1, 2, 4].map((id) => ({
        target: GMD_VAULT,
        params: [id],
      })),
      abi: gmdAbi['poolInfo'],
      permitFailure: true,
    })
  ).output.map(({ output }) => [output.GDlptoken, output]);
};
const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );
  return pricesByAddress;
};

const calculateApy = (ratePerTimestamps) => {
  const blocksPerDay = BLOCKS_PER_DAY;
  const daysPerYear = 365;

  return (
    (Math.pow(ratePerTimestamps * blocksPerDay + 1, daysPerYear) - 1) * 100
  );
};

const getRewards = async (markets, rewardMethod) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: [market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardMethod),
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const main = async () => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: COMPTROLLER_ADDRESS,
      chain: CHAIN,
      abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
    })
  ).output;
  const allMarkets = Object.values(allMarketsRes);

  const markets = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: comptrollerAbi.find((n) => n.name === 'markets'),
      calls: allMarkets.map((m) => ({
        target: COMPTROLLER_ADDRESS,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const extraRewards = await getRewards(allMarkets, REWARD_SPEED);
  const extraRewardsBorrow = await getRewards(allMarkets, REWARD_SPEED_BORROW);
  const isPaused = await getRewards(allMarkets, 'mintGuardianPaused');

  const supplyRewards = await multiCallMarkets(
    allMarkets,
    SUPPLY_RATE,
    ercDelegator
  );

  const borrowRewards = await multiCallMarkets(
    allMarkets,
    BORROW_RATE,
    ercDelegator
  );

  const marketsCash = await multiCallMarkets(
    allMarkets,
    GET_CASH,
    ercDelegator
  );
  const totalBorrows = await multiCallMarkets(
    allMarkets,
    TOTAL_BORROWS,
    ercDelegator
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    'underlying',
    ercDelegator
  );

  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    ercDelegator
  );
  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    ercDelegator
  );
  const prices = await getPrices(
    underlyingTokens
      .concat([NATIVE_TOKEN.address])
      .map((token) => `${CHAIN}:` + token)
  );
  const gmdInfo = Object.fromEntries(await getGmdInfo(GMD_IDS));
  const glpApy = await getGlpApy();

  const tenderPrices = await getPrices([`${CHAIN}:${PROTOCOL_TOKEN.address}`]);
  tenderPrices[PROTOCOL_ESTOKEN.address] = tenderPrices[PROTOCOL_TOKEN.address];

  const handleApyUnderlying = (market, symbol, supplyRewards) => {
    const aprToApy = (interest, frequency) =>
      ((1 + interest / 100 / frequency) ** frequency - 1) * 100;

    if (symbol == 'fsGLP') {
      return glpApy;
    } else if (GMD_TOKENS[symbol]) {
      const apr = gmdInfo[GMD_TOKENS[symbol].underlying].APR;
      return aprToApy(apr / 100, 365).toPrecision(4);
    }
    return calculateApy(supplyRewards / 10 ** 18);
  };

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || NATIVE_TOKEN.address;
    const symbol = underlyingSymbols[i] || 'ETH';

    const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd')
        ? 1
        : symbol == 'gmdBTC'
        ? prices['0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'.toLowerCase()]
        : symbol == 'gmdETH'
        ? prices[NATIVE_TOKEN.address.toLowerCase()]
        : 0;

    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const apyBase = handleApyUnderlying(market, symbol, supplyRewards[i]);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

    const calcRewardApy = (rewards, denom) => {
      return (
        (((rewards[i] / 10 ** PROTOCOL_ESTOKEN.decimals) *
          BLOCKS_PER_DAY *
          365 *
          tenderPrices[PROTOCOL_ESTOKEN.address]) /
          denom) *
        100
      );
    };
    const apyReward = calcRewardApy(extraRewards, totalSupplyUsd);
    const _apyRewardBorrow = calcRewardApy(extraRewardsBorrow, totalBorrowUsd);
    const apyRewardBorrow = isNaN(_apyRewardBorrow) ? 0 : _apyRewardBorrow;

    let poolReturned = {
      pool: market.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol: symbol,
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [token],
      rewardTokens: [apyReward ? PROTOCOL_ESTOKEN.address : null].filter(
        Boolean
      ),
      totalSupplyUsd,
      ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow,
    };
    return poolReturned;
  });
  return pools.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.tender.fi',
};
