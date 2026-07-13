const axios = require('axios');
const { getPriceApiData } = require('../utils');

const SUBGRAPH_URL =
  'https://graph-readonly.linkpool.pro/subgraphs/name/stakedotlink-ethereum-staging-2';

const poolsQuery = `
  {
    linkPool: priorityStakingPool(id: "LINKPool", subgraphError: allow) {
      total_staked
      reward_rate
    }
    polPool: priorityStakingPool(id: "POLPool", subgraphError: allow) {
      total_staked
      reward_rate
    }
  }
  `;

const pools = [
  {
    symbol: 'stLINK',
    address: '0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5',
    priceId: 'chainlink',
    chain: 'Ethereum',
    underlying: '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
    poolField: 'linkPool',
    url: 'https://stake.link/link/stake',
  },
  {
    symbol: 'stPOL',
    address: '0x2ff4390dB61F282Ef4E6D4612c776b809a541753',
    priceId: 'polygon-ecosystem-token',
    chain: 'Ethereum',
    underlying: '0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6', // POL
    poolField: 'polPool',
    url: 'https://stake.link/pol/stake',
  },
];

const fetchPrices = async () => {
  const priceKeys = pools.map((pool) => `coingecko:${pool.priceId}`);
  const data = await getPriceApiData(`/prices/current/${priceKeys.join(',')}`);
  return data.coins;
};

const fetchPools = async () => {
  const [prices, response] = await Promise.all([
    fetchPrices(),
    axios.post(SUBGRAPH_URL, JSON.stringify({ query: poolsQuery })),
  ]);

  return pools
    .map((pool) => {
      const poolData = response.data?.data?.[pool.poolField];
      const price = prices[`coingecko:${pool.priceId}`]?.price;
      if (!poolData || price === undefined) {
        console.error(`Missing subgraph or price data for ${pool.symbol}`);
        return null;
      }

      const totalStaked = Number(poolData.total_staked) / 1e18;

      return {
        pool: `${pool.address}-${pool.chain}`.toLowerCase(),
        chain: pool.chain,
        project: 'stake.link-liquid',
        symbol: pool.symbol,
        tvlUsd: totalStaked * price,
        apyBase: parseFloat(poolData.reward_rate),
        underlyingTokens: [pool.underlying],
        searchTokenOverride: pool.address,
        isIntrinsicSource: true,
        url: pool.url,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '2378',
  timetravel: false,
  apy: fetchPools,
  url: 'https://stake.link/',
};
