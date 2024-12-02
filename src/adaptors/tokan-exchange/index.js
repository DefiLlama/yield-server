const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abis/PairFactory.json');
const abiPairAPI = require('./abis/PairAPI.json');

const PAIR_FACTORY_ADDRESS = '0x92aF10c685D2CF4CD845388C5f45aC5dc97C5024';
const PAIR_API_ADDRESS = '0xCDC8b03a1a8318d7b78d5D6349B4435b251f8853';
const TKN_ADDRESS = '0x1a2fCB585b327fAdec91f55D45829472B15f17a4';
const CHAIN_NAME = 'scroll';

/**
 * Retrieves and computes APY for pools of tokens on the Polygon blockchain.
 */
const getAPY = async () => {
  const allPairs = await getAllPairs();
  const pairInfo = await getPairInfo(allPairs);
  const prices = await getTokenPrices(pairInfo);
  const tknPrice = prices[TKN_ADDRESS.toLowerCase()];

  computePairInfo(pairInfo, prices, tknPrice);

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
    'pairFee',
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
    'weight',
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
        .concat(TKN_ADDRESS)
    ),
  ];

  const allCoins = (
    await axios.get(
      'https://api.coingecko.com/api/v3/coins/list?include_platform=true'
    )
  ).data.filter(
    (coin) => coin && coin.platforms && coin.platforms['scroll']
  );

  const tokenAddresses = tokens.map((a) => a.toLowerCase());
  const coins = allCoins.filter((coin) =>
    tokenAddresses.includes(coin.platforms['scroll'].toLowerCase())
  );
  const markets = (
    await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins
        .map((c) => c.id)
        .join(',')}`
    )
  ).data;

  async function getPriceFromGeckoTerminal(token) {
    const price = (
      await axios.get(`https://api.geckoterminal.com/api/v2/networks/scroll/tokens/${token}`)
    ).data.data.attributes.price_usd
    return price
  }

  function getPriceFromCoinGecko(token) {
    const id = allCoins.find(
      (coin) =>
        coin.platforms['scroll'].toLowerCase() === token.toLowerCase()
    )?.id;
    if (id === undefined) return undefined;
    const marketData = markets.find((m) => m.id === id);
    return marketData?.current_price;
  }

  async function getPrice(token) {
    return getPriceFromCoinGecko(token)
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
function computePairInfo(pairInfo, prices, tknPrice) {
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
      (((pi.emissions / Math.pow(10, 18)) * tknPrice * 86400 * 365) /
        pi.stakedUsd) *
      100;
  }
}

/**
 * Formats a pair info object into a pool object.
 */
function formatPool(p) {
  const apyReward =p.apr; // NOT daily compounding, APR NOT APY
  return {
    pool: p.pair_address,
    chain: utils.formatChain('Scroll'),
    project: 'tokan-exchange',
    symbol: utils.formatSymbol(p.symbol.split('-')[1]),
    poolMeta: p.stable ? 'stable' : 'volatile',
    tvlUsd: p.pairTvlUsd,
    apyReward,
    rewardTokens: p.apr ? [TKN_ADDRESS] : [],
    underlyingTokens: [p.token0, p.token1],
  };
}

module.exports = {
  timetravel: false,
  apy: getAPY,
  url: 'https://app.tokan.exchange/liquidity',
};