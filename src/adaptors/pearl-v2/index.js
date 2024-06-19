const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abis/PairFactory.json');
const abiPairAPI = require('./abis/PairAPI.json');
const abiBoxTrident = require('./abis/BoxTrident.json');

const PAIR_FACTORY_ADDRESS = '0xeF0b0a33815146b599A8D4d3215B18447F2A8101';
const PAIR_API_ADDRESS = '0xa0b313836ec65bD999cc78a0000C7f0a8DCe16A9';
const PEARL_V2_AMOUNTS = '0x861e27AF5B47a7D91e801cc1cd8d19bD3fcDFCA6';
const PEARL_ADDRESS = '0xCE1581d7b4bA40176f0e219b2CaC30088Ad50C7A';
const CHAIN_NAME = 'real';

/**
 * Retrieves and computes APY for pools of tokens on the Polygon blockchain.
 */
const getAPY = async () => {
  const allPairs = await getAllPairs();
  const pairInfo = await getPairInfo(allPairs);
  const prices = await getTokenPrices(pairInfo);
  const pearlPrice = prices[PEARL_ADDRESS.toLowerCase()];

  await computePairInfo(pairInfo, prices, pearlPrice);

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
    // pair info
    "version",
    "pair_address", // pair contract address
    "box_address", // box contract address
    "box_manager_address", // box manager contract address
    "name", // pair name
    "symbol", // pair symbol
    "decimals", //v1Pools LP token decimals
    "token0", // pair 1st token address
    "token1", // pair 2nd token address
    "fee", // fee of the pair
    "token0_symbol", // pair 1st token symbol
    "token0_decimals", // pair 1st token decimals
    "token1_symbol", // pair 2nd token symbol
    "token1_decimals", // pair 2nd token decimals
    "total_supply", // total supply of v1 pools
    "total_supply0", // token0 available in pool
    "total_supply1", // token1 available in pool
    "total_liquidity", //liquidity of the pool
    "sqrtPriceX96",
    "tick",
    // pairs gauge
    "gauge", // pair gauge address
    "gauge_alm", // pair gauge ALM address
    "gauge_alm_total_supply", // pair staked tokens (less/eq than/to pair total supply)
    "gauge_fee", // pair fees contract address
    "gauge_fee_claimable0", // fees claimable in token1
    "gauge_fee_claimable1", // fees claimable in token1
    "bribe", // pair bribes contract address
    "emissions", // pair emissions (per second) for active liquidity
    "emissions_token", // pair emissions token address
    "emissions_token_decimals", // pair emissions token decimals
    //alm
    "alm_lower", //lower limit of the alm
    "alm_upper", //upper limit of the alm
    "alm_total_supply0", // token0 available in alm
    "alm_total_supply1", // token1 available in alm
    "alm_staked_supply0", // token0 available in alm for staked ALM LP token
    "alm_staked_supply1", // token1 available in alm for staked ALM LP token
    "alm_total_liquidity", //liquidity of the alm
    // User deposit
    "account_lp_balance", //v1Pools account LP tokens balance
    "account_lp_amount0", // total amount of token0 available in pool including alm for account
    "account_lp_amount1", //  total amount of token1 available in pool including alm for account
    "account_lp_alm", // total amount of token0 available in pool including alm for account
    "account_lp_alm_staked", // total amount of token0 available in pool including alm for account
    "account_lp_alm_amount0", // amount of token0 available in alm for account
    "account_lp_alm_amount1", //  amount of token1 available in alm for account
    "account_lp_alm_staked_amount0", // amount of token1 for staked ALM LP token
    "account_lp_alm_staked_amount1", // amount of token0 for stakedALM  LP token
    "account_lp_alm_earned", // amount of rewards earned on stake ALM LP token
    "account_lp_alm_claimable0", // total amount of token0 available in pool including alm for account
    "account_lp_alm_claimable1", // total amount of token0 available in pool including alm for account
    "account_token0_balance", // account 1st token balance
    "account_token1_balance", // account 2nd token balance
    'account_gauge_balance', // account pair staked in gauge balance
  ];

  const abi = abiPairAPI.find((m) => m.name === 'getPair');
  
  const result = await Promise.all(
    allPairs.map((i) => sdk.api.abi.call({
      target: PAIR_API_ADDRESS,
      params: [i, '0x1111110000000000000000000000000000000000', 1],
      abi: abi,
      chain: CHAIN_NAME,
    }))
  );
  
  const pairInfo = result.map((o) => Object.fromEntries(zip(keys, o.output)));

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
    (coin) => coin && coin.platforms && coin.platforms['re-al']
  );

  const tokenAddresses = tokens.map((a) => a.toLowerCase());
  const coins = allCoins.filter((coin) =>
    tokenAddresses.includes(coin.platforms['re-al'].toLowerCase())
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
        coin.platforms['re-al'].toLowerCase() === token.toLowerCase()
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
async function computePairInfo(pairInfo, prices, pearlPrice) {
  pairInfo = pairInfo.filter((p) => Number(p.total_liquidity) !== 0);
  for (let i = 0; i < pairInfo.length; i++) {
    const pi = pairInfo[i];
    pi.reserve0Usd = pi.total_supply0 === 0 ? 0 :
      (pi.total_supply0 / Math.pow(10, pi.token0_decimals)) *
      (prices[pi.token0.toLowerCase()] ?? 0);
    pi.reserve1Usd = pi.total_supply1 === 0 ? 0 :
      (pi.total_supply1 / Math.pow(10, pi.token1_decimals)) *
      (prices[pi.token1.toLowerCase()] ?? 0);
    pi.pairTvlUsd = pi.reserve0Usd + pi.reserve1Usd;
    // calculate staked amount by using pearl v2 amounts contract
    const results = pi.box_address !== "0x0000000000000000000000000000000000000000" ? (await sdk.api.abi.call({
      target: pi.box_address,
      abi: abiBoxTrident.find((m) => m.name === 'getTotalAmounts'),
      chain: CHAIN_NAME,
    })).output : {pool0:0, pool1:0,  liquidity:0, total0:0, total1:0};

    // through amounts
    pi.stakedReserve0Usd = results.total0 === 0 ? 0 :
      (results.total0 / Math.pow(10, pi.token0_decimals)) *
      (prices[pi.token0.toLowerCase()] ?? 0);
    pi.stakedReserve1Usd = results.total1 === 0 ? 0 :
      (results.total1 / Math.pow(10, pi.token1_decimals)) *
      (prices[pi.token1.toLowerCase()] ?? 0);
    pi.stakedUsd = pi.stakedReserve0Usd + pi.stakedReserve1Usd;

    pi.apr = pi.stakedUsd === 0 ? 0 :
      (((pi.emissions / Math.pow(10, 18)) * pearlPrice * 86400 * 365) /
        pi.stakedUsd) *
      100;
  }
}

/**
 * Formats a pair info object into a pool object.
 */
function formatPool(p) {
  return {
    pool: p.pair_address,
    chain: utils.formatChain('real'),
    project: 'pearl-v2',
    symbol: utils.formatSymbol(p.symbol.split('-')[1]),
    tvlUsd: p.pairTvlUsd,
    apyReward: p.apr,
    rewardTokens: p.apr ? [PEARL_ADDRESS] : [],
    underlyingTokens: [p.token0, p.token1],
  };
}

module.exports = {
  timetravel: false,
  apy: getAPY,
  url: 'https://www.pearl.exchange/pools',
};
