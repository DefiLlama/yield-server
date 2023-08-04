const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abis/PairFactory.json');
const abiPairAPI = require('./abis/PairAPI.json');

const PAIR_FACTORY_ADDRESS = '0xEaF188cdd22fEEBCb345DCb529Aa18CA9FcB4FBd';
const PAIR_API_ADDRESS = '0xa6E13F76632A5c6c007Da0Fc00e8659fCEB7Bb66';
const PEARL_ADDRESS = '0x7238390d5f6F64e67c3211C343A410E2A3DEc142';
const CHAIN_NAME = 'polygon';

/**
 * Retrieves and computes APY for pools of tokens on the Polygon blockchain.
 */
const getAPY = async () => {
  const allPairs = await getAllPairs();
  const pairInfo = await getPairInfo(allPairs);
  const prices = await getTokenPrices(pairInfo);
  const pearlPrice = prices[PEARL_ADDRESS.toLowerCase()];

  computePairInfo(pairInfo, prices, pearlPrice);

  return pairInfo.map(formatPool).filter(utils.keepFinite);
};

/**
 * Fetches all pairs from the blockchain.
 */
async function getAllPairs() {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: PAIR_FACTORY_ADDRESS,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain: CHAIN_NAME,
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: PAIR_FACTORY_ADDRESS,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain: CHAIN_NAME,
    })
  ).output.map((o) => o.output);

  return allPairs;
}

/**
 * Fetches and formats pair info from the blockchain.
 */
async function getPairInfo(allPairs) {
  const zip = (a, b) => a.map((k, i) => [k, b[i]]);
  const keys = [
    'pair_address',
    'symbol',
    'name',
    'decimals',
    'stable',
    'total_supply',
    // token pair info
    'token0',
    'token0_symbol',
    'token0_decimals',
    'reserve0',
    'claimable0',
    'token1',
    'token1_symbol',
    'token1_decimals',
    'reserve1',
    'claimable1',
    // pairs gauge
    'gauge',
    'gauge_total_supply',
    'fee',
    'bribe',
    'emissions',
    'emissions_token',
    'emissions_token_decimals',
    // user deposit
    'account_lp_balance',
    'account_token0_balance',
    'account_token1_balance',
    'account_gauge_balance',
    'account_gauge_earned',
  ];

  const pairInfo = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: PAIR_API_ADDRESS,
        params: [i, '0x0000000000000000000000000000000000000000'],
      })),
      abi: abiPairAPI.find((m) => m.name === 'getPair'),
      chain: CHAIN_NAME,
    })
  ).output.map((o) => Object.fromEntries(zip(keys, o.output)));

  return pairInfo;
}

/**
 * Fetches prices for all tokens used in the pairs.
 */
async function getTokenPrices(pairInfo) {
  const tokens = [
    ...new Set(
      pairInfo
        .map((p) => [p.token0, p.token1])
        .flat()
        .concat(PEARL_ADDRESS)
    ),
  ];

  const allCoins = (
    await axios.get(
      'https://api.coingecko.com/api/v3/coins/list?include_platform=true'
    )
  ).data.filter(
    (coin) => coin && coin.platforms && coin.platforms['polygon-pos']
  );

  const tokenAddresses = tokens.map((a) => a.toLowerCase());
  const coins = allCoins.filter((coin) =>
    tokenAddresses.includes(coin.platforms['polygon-pos'].toLowerCase())
  );
  const markets = (
    await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins
        .map((c) => c.id)
        .join(',')}`
    )
  ).data;

  async function getPriceFromDexScreener(token) {
    const pairs = (
      await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`)
    ).data.pairs;
    if (!pairs?.length) return undefined;
    const totalLiquidity = pairs
      .map((p) => p.liquidity.usd)
      .reduce((a, b) => a + b);
    return (
      pairs.map((p) => p.priceUsd * p.liquidity.usd).reduce((a, b) => a + b) /
      totalLiquidity
    );
  }

  function getPriceFromCoinGecko(token) {
    const id = allCoins.find(
      (coin) =>
        coin.platforms['polygon-pos'].toLowerCase() === token.toLowerCase()
    )?.id;
    if (id === undefined) return undefined;
    const marketData = markets.find((m) => m.id === id);
    return marketData?.current_price;
  }

  async function getPrice(token) {
    return (
      getPriceFromCoinGecko(token) ?? (await getPriceFromDexScreener(token))
    );
  }

  const pricePromises = tokenAddresses.map((t) =>
    getPrice(t).then((p) => [t, p])
  );
  const prices = await Promise.all(pricePromises).then((results) =>
    Object.fromEntries(results)
  );

  return prices;
}

/**
 * Computes additional properties for each pair info object.
 */
function computePairInfo(pairInfo, prices, pearlPrice) {
  for (const pi of pairInfo) {
    pi.reserve0Usd =
      (pi.reserve0 / Math.pow(10, pi.token0_decimals)) *
      prices[pi.token0.toLowerCase()];
    pi.reserve1Usd =
      (pi.reserve1 / Math.pow(10, pi.token1_decimals)) *
      prices[pi.token1.toLowerCase()];
    pi.pairTvlUsd = pi.reserve0Usd + pi.reserve1Usd;
    pi.staked = pi.gauge_total_supply / pi.total_supply;
    pi.stakedUsd = pi.pairTvlUsd * pi.staked;
    pi.apr =
      (((pi.emissions / Math.pow(10, 18)) * pearlPrice * 86400 * 365) /
        pi.stakedUsd) *
      100;
  }
}

/**
 * Formats a pair info object into a pool object.
 */
function formatPool(p) {
  const apyReward = (Math.pow(1 + p.apr / 36500, 365) - 1) * 100; // daily compounding
  return {
    pool: p.pair_address,
    chain: utils.formatChain('polygon'),
    project: 'pearlfi',
    symbol: utils.formatSymbol(p.symbol.split('-')[1]),
    tvlUsd: p.pairTvlUsd,
    apyReward,
    rewardTokens: p.apr ? [PEARL_ADDRESS] : [],
    underlyingTokens: [p.token0, p.token1],
  };
}

module.exports = {
  timetravel: false,
  apy: getAPY,
  url: 'https://www.pearl.exchange/liquidity',
};
