const utils = require('../utils');
const superagent = require('superagent');

const SUBGRAPH_URL =
  'https://graph-readonly.linkpool.pro/subgraphs/name/stakedotlink-ethereum-production';
const CHAIN_NAME = 'Ethereum';

const getData = async (url, query = null) => {
  let res;
  if (query !== null) {
    res = await superagent
      .post(url)
      .send(query)
      .set('Content-Type', 'application/json');
  } else {
    res = await superagent.get(url);
  }
  return res.body;
};

const wsdQuery = `
  {
    wsdstakingPools {
      id
      reward_rate_stpol_9x
      reward_rate_stlink_9x
      tvl
    }
  }
`;

const pools = [
  {
    symbol: 'SDL', // Stake.link token
    address: '0xa95c5ebb86e0de73b4fb8c47a45b792cfea28c23', // SDL token contract address
    priceId: 'stake-link', // CoinGecko ID for SDL token
  },
];

const fetchPrice = async (tokenId) => {
  const priceKey = `coingecko:${tokenId}`;
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  return data.coins[priceKey].price;
};

const fetchPool = async (pool) => {
  try {
    const { symbol, address, priceId } = pool;

    const price = await fetchPrice(priceId);

    const response = await getData(
      SUBGRAPH_URL,
      JSON.stringify({ query: wsdQuery })
    );

    if (
      !response ||
      !response.data ||
      !response.data.wsdstakingPools ||
      !response.data.wsdstakingPools[0]
    ) {
      throw new Error('Invalid data structure received from subgraph');
    }

    const poolData = response.data.wsdstakingPools[0];

    // Combine both stPOL and stLINK 9x reward rates
    const stpolRewardRate = parseFloat(poolData.reward_rate_stpol_9x);
    const stlinkRewardRate = parseFloat(poolData.reward_rate_stlink_9x);
    const combinedRewardRate = stpolRewardRate + stlinkRewardRate;

    // Rates are already in percentage form, no need to multiply by 100
    const apy = combinedRewardRate;

    // Use TVL from the subgraph
    const tvl = parseFloat(poolData.tvl);

    return {
      pool: `${address}-${CHAIN_NAME}`.toLowerCase(),
      chain: CHAIN_NAME,
      project: 'stake.link-index',
      symbol,
      tvlUsd: tvl,
      apyBase: apy,
    };
  } catch (error) {
    console.error(
      `Error fetching pool data for ${pool.symbol}:`,
      error.message
    );
    return null;
  }
};

const fetchPools = async () => {
  const poolsData = await Promise.all(pools.map(fetchPool));
  return poolsData.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: fetchPools,
  url: 'https://stake.link/sdl',
};
