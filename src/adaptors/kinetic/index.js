const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const { Web3, eth } = require('web3');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { comptrollerAbi, cToken, flrETH } = require('./abi');
const { symbol } = require('@defillama/sdk/build/erc20');

const COMPTROLLER_ADDRESS = '0x8041680Fb73E1Fe5F851e76233DCDfA0f2D2D7c8';
const FLR_ETH = '0x26a1fab310bd080542dc864647d05985360b16a5';
const WETH = '0x1502fa4be69d526124d453619276faccab275d3d';
const FLARE_CHAIN = 'flare';

const JOULE = {
  decimals: 18,
  symbol: 'JOULE',
  address: "0xe6505f92583103af7ed9974dec451a7af4e3a3be"
};

const FLR = {
  decimals: 18,
  symbol: 'FLR',
  address: '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d', // same price of WFLR
};

const KII = {
  decimals: 18,
  symbol: 'KII',
  address: '0xe6505f92583103af7ed9974dec451a7af4e3a3be', // same price of JOULE
};

const RFLR = {
  decimals: 18,
  symbol: 'RFLR',
  address: '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d', // same price of WFLR
};

const REWARD_TYPES = {
  JOULE: 0,
  FLR: 1,
  KII: 2,
  RFLR: 3
};

const SECONDS_PER_DAY = 86400;

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
  const secondsPerDay = 86400; // seconds per day
  const daysPerYear = 365;

  return (
    (Math.pow((ratePerTimestamps / 1e18) * secondsPerDay + 1, daysPerYear) -
      1) *
    100
  );
};

const getRewards = async (rewardType, markets, isBorrow = false) => {
  return (
    await sdk.api.abi.multiCall({
      chain: FLARE_CHAIN,
      calls: markets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: [rewardType, market],
      })),
      abi: comptrollerAbi.find(
        ({ name }) => name === `${isBorrow ? 'borrow' : 'supply'}RewardSpeeds`
      ),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi) => {
  return (
    await sdk.api.abi.multiCall({
      chain: FLARE_CHAIN,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const getApy = async () => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: COMPTROLLER_ADDRESS,
      chain: FLARE_CHAIN,
      abi: comptrollerAbi.find(({ name }) => name === 'getAllMarkets'),
      permitFailure: true,
    })
  ).output;

  const allMarkets = Object.values(allMarketsRes);

  const marketsInfo = (
    await sdk.api.abi.multiCall({
      chain: FLARE_CHAIN,
      calls: allMarkets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: market,
      })),
      abi: comptrollerAbi.find(({ name }) => name === 'markets'),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const jouleRewards = await getRewards(REWARD_TYPES.JOULE, allMarkets);
  const flrRewards = await getRewards(REWARD_TYPES.FLR, allMarkets);
  const kiiRewards = await getRewards(REWARD_TYPES.KII, allMarkets);
  const rFLRRewards = await getRewards(REWARD_TYPES.RFLR, allMarkets);

  const jouleBorrowRewards = await getRewards(REWARD_TYPES.JOULE, allMarkets, true);
  const flrBorrowRewards = await getRewards(REWARD_TYPES.FLR, allMarkets, true);
  const kiiBorrowRewards = await getRewards(REWARD_TYPES.KII, allMarkets, true);
  const rflrBorrowRewards = await getRewards(REWARD_TYPES.RFLR, allMarkets, true);
  
  const supplyRatePerTimestamp = await multiCallMarkets(
    allMarkets,
    'supplyRatePerTimestamp',
    cToken
  );

  const borrowRatePerTimestamp = await multiCallMarkets(
    allMarkets,
    'borrowRatePerTimestamp',
    cToken
  );

  const marketsCash = await multiCallMarkets(allMarkets, 'getCash', cToken);
  const totalBorrows = await multiCallMarkets(
    allMarkets,
    'totalBorrows',
    cToken
  );
  const totalReserves = await multiCallMarkets(
    allMarkets,
    'totalReserves',
    cToken
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    'underlying',
    cToken
  );
  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    cToken
  );
  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    cToken
  );

  const prices = await getPrices(
    underlyingTokens.concat([FLR.address, JOULE.address]).map((token) => 'flare:' + token)
  );

  if(!prices[FLR_ETH]){
    const wethPrice = prices[WETH];
    if(wethPrice){
      const flrETHToETH = (
        await sdk.api.abi.call({
          target: FLR_ETH,
          chain: FLARE_CHAIN,
          abi: flrETH.find(({ name }) => name === 'LSTPerToken'),
          permitFailure: true,
        })
      ).output;

      if(flrETHToETH){
        prices[FLR_ETH] = wethPrice * (flrETHToETH / 10 ** 18);
      }
    }
  }

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i];
    const decimals = Number(underlyingDecimals[i]);

    const totalSupplyUsd =
      ((Number(marketsCash[i]) +
        Number(totalBorrows[i]) -
        Number(totalReserves[i])) /
        10 ** decimals) *
      prices[token.toLowerCase()];

    const totalBorrowUsd =
      (Number(totalBorrows[i]) / 10 ** decimals) * prices[token.toLowerCase()];
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    const apyBase = calculateApy(supplyRatePerTimestamp[i]);
    const apyBaseBorrow = calculateApy(borrowRatePerTimestamp[i]);

    const jouleApy =
      ((1 + (
        (
          (jouleRewards[i] / 10 ** JOULE.decimals) *
          SECONDS_PER_DAY *
          prices[JOULE.address]
        ) /
        totalSupplyUsd))**365 - 1) * 100;
    const flrApy =
      ((1 + (
        (
          (flrRewards[i] / 10 ** FLR.decimals) *
          SECONDS_PER_DAY *
          prices[FLR.address]
        ) /
        totalSupplyUsd))**365 - 1) * 100;
    const kiiApy =
      ((1 + (
        (
          (kiiRewards[i] / 10 ** KII.decimals) *
          SECONDS_PER_DAY *
          prices[KII.address]
        ) /
        totalSupplyUsd))**365 - 1) * 100;
    const rflrApy =
      ((1 + (
        (
          (rFLRRewards[i] / 10 ** RFLR.decimals) *
          SECONDS_PER_DAY *
          prices[RFLR.address]
        ) /
        totalSupplyUsd))**365 - 1) * 100;

    const jouleBorrowApy =
      ((1 + (
        (
          (jouleBorrowRewards[i] / 10 ** JOULE.decimals) *
          SECONDS_PER_DAY *
          prices[JOULE.address]
        ) /
        totalBorrowUsd))**365 - 1) * 100;
    const flrBorrowApy =
      ((1 + (
        (
          (flrBorrowRewards[i] / 10 ** FLR.decimals) *
          SECONDS_PER_DAY *
          prices[FLR.address]
        ) /
        totalBorrowUsd))**365 - 1) * 100;
    const kiiBorrowApy =
      ((1 + (
        (
          (kiiBorrowRewards[i] / 10 ** KII.decimals) *
          SECONDS_PER_DAY *
          prices[KII.address]
        ) /
        totalBorrowUsd))**365 - 1) * 100;
    const rflrBorrowApy =
      ((1 + (
        (
          (rflrBorrowRewards[i] / 10 ** RFLR.decimals) *
          SECONDS_PER_DAY *
          prices[RFLR.address]
        ) /
        totalBorrowUsd))**365 - 1) * 100;

    const apyRewardBorrow = jouleBorrowApy + flrBorrowApy + kiiBorrowApy + rflrBorrowApy;

    return {
      pool: market,
      chain: utils.formatChain('flare'),
      project: 'kinetic',
      symbol: underlyingSymbols[i],
      tvlUsd,
      apyBase,
      apyReward: jouleApy + flrApy + kiiApy + rflrApy,
      underlyingTokens: [token],
      rewardTokens: [
        jouleApy ? JOULE.address : null,
        flrApy ? FLR.address : null,
        kiiApy ? KII.address : null,
        rflrApy ? RFLR.address : null,
      ].filter(Boolean),
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: Number.isFinite(apyRewardBorrow) ? apyRewardBorrow : 0,
      ltv: marketsInfo[i].collateralFactorMantissa / 10 ** 18,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.kinetic.market/dashboard',
};
