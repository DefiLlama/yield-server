const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { comptrollerAbi, ercDelegator } = require('./abi');

const COMPTROLLER_ADDRESS = {
  P0: '0x79b56CB219901DBF42bB5951a0eDF27465F96206',
  P1: '0xB70FB69a522ed8D4613C4C720F91F93a836EE2f5',
  P2: '0x9dEb56b9DD04822924B90ad15d01EE50415f8bC7',
  P3: '0x7312a3BC8733B068989Ef44bAC6344F07cFcDE7F',
  P4: '0x3903E6EcD8bc610D5a01061B1Dc31affD21F81C6',
};

const CHAIN = 'ethereum';
const GET_ALL_MARKETS = 'getAllMarkets';

const REWARD_SPEED_OG = 'compSpeeds';
const REWARD_SPEED = 'compSupplySpeeds';
const REWARD_SPEED_BORROW = 'compBorrowSpeeds';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 86400 / 12;
const PROJECT_NAME = 'drops';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'.toLowerCase(),
};

const PROTOCOL_TOKEN = {
  decimals: 18,
  symbol: 'DOP',
  address: '0x6bB61215298F296C55b19Ad842D3Df69021DA2ef'.toLowerCase(),
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

const getRewards = async (comptrollerAddress, markets, rewardMethod) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({
        target: comptrollerAddress,
        params: [market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardMethod),
      permitFailure: true,
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
  const getDropsPoolResult = async (dropsPool, comptrollerAddress) => {
    const allMarketsRes = (
      await sdk.api.abi.call({
        target: comptrollerAddress,
        chain: CHAIN,
        abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
        permitFailure: true,
      })
    ).output;
    let allMarkets = Object.values(allMarketsRes);

    const marketsDecimal = await multiCallMarkets(
      allMarkets,
      'decimals',
      ercDelegator
    );

    allMarkets = allMarkets.filter((m, i) => Number(marketsDecimal[i]));

    const markets = (
      await sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: comptrollerAbi.find((n) => n.name === 'markets'),
        calls: allMarkets.map((m) => ({
          target: comptrollerAddress,
          params: [m],
        })),
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const extraRewards = await getRewards(
      comptrollerAddress,
      allMarkets,
      comptrollerAddress == '0x79b56CB219901DBF42bB5951a0eDF27465F96206'
        ? REWARD_SPEED_OG
        : REWARD_SPEED
    );
    const extraRewardsBorrow = await getRewards(
      comptrollerAddress,
      allMarkets,
      comptrollerAddress == '0x79b56CB219901DBF42bB5951a0eDF27465F96206'
        ? REWARD_SPEED_OG
        : REWARD_SPEED_BORROW
    );

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
      UNDERLYING,
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

    const priceKey = 'coingecko:drops-ownership-power';
    const protocolTokenPrice = (
      await utils.getData(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).coins[priceKey].price;

    prices[PROTOCOL_TOKEN.address] = protocolTokenPrice;

    const pools = allMarkets.map((market, i) => {
      const token = underlyingTokens[i] || NATIVE_TOKEN.address;
      const symbol = underlyingSymbols[i] || NATIVE_TOKEN.symbol;

      const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
      let price = prices[token.toLowerCase()];
      if (price === undefined)
        price = symbol.toLowerCase().includes('usd') ? 1 : 0;

      const totalSupplyUsd =
        ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
        price;
      const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

      const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

      const apyBase = calculateApy(supplyRewards[i] / 10 ** 18);
      const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

      const calcRewardApy = (rewards, denom) => {
        return (
          (((rewards[i] / 10 ** PROTOCOL_TOKEN.decimals) *
            BLOCKS_PER_DAY *
            365 *
            prices[PROTOCOL_TOKEN.address]) /
            denom) *
          100
        );
      };
      const apyReward = totalSupplyUsd
        ? calcRewardApy(extraRewards, totalSupplyUsd)
        : 0;
      const apyRewardBorrow = totalBorrowUsd
        ? calcRewardApy(extraRewardsBorrow, totalBorrowUsd)
        : 0;

      return {
        pool: `${comptrollerAddress}-${market.toLowerCase()}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT_NAME,
        symbol,
        poolMeta: dropsPool,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [token],
        rewardTokens: [apyReward ? PROTOCOL_TOKEN.address : null].filter(
          Boolean
        ),
        // borrow fields
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        apyRewardBorrow,
        ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
      };
    });

    return pools;
  };

  const dropsPoolsResult = [];
  const proms = [];
  Object.keys(COMPTROLLER_ADDRESS).forEach(async (dropsPool) => {
    proms.push(getDropsPoolResult(dropsPool, COMPTROLLER_ADDRESS[dropsPool]));
  });

  (await Promise.all(proms)).map((pools) => {
    dropsPoolsResult.push(...pools);
  });

  return dropsPoolsResult;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://drops.co/',
};
