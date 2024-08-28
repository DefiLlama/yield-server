const { ethers } = require('ethers');
const superagent = require('superagent');

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

const SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/72555/stakedotlink-ethereum/version/latest';

const query = `
  {
    totalRewardAmounts {
      totalRewardSTLINK
      __typename
    }
    totalCounts {
      linkStakingDistributionCount
      __typename
    }
    linkStakingDistributions(
      first: 1
      skip: 0
      orderBy: ts
      orderDirection: desc
    ) {
      reward_rate
      reward_amount
      total_staked
      fees
      fee_percentage
      tx_hash
      ts
      __typename
    }
  }
  `;

const API_URL = 'https://stake.link/v1/metrics/staking';
const CHAIN_NAME = 'Ethereum';

const pools = [
  {
    symbol: 'stLINK',
    address: '0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5',
    priceId: 'chainlink',
  },
];

const fetchPrice = async (tokenId) => {
  const priceKey = `coingecko:${tokenId}`;
  const data = await getData(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  return data.coins[priceKey].price;
};

const fetchPool = async (pool) => {
  try {
    const { symbol, address, priceId } = pool;
    const price = await fetchPrice(priceId);
    const response = await getData(SUBGRAPH_URL, JSON.stringify({ query }));

    if (
      !response ||
      !response.data ||
      !response.data.linkStakingDistributions ||
      !response.data.linkStakingDistributions[0]
    ) {
      throw new Error('Invalid data structure received from subgraph');
    }

    const distribution = response.data.linkStakingDistributions[0];
    const apy = parseFloat(distribution.reward_rate);
    const totalStakedInWei = distribution.total_staked;
    const totalStaked = parseFloat(ethers.utils.formatEther(totalStakedInWei));
    const tvl = totalStaked * price;

    return {
      pool: `${address}-${CHAIN_NAME}`.toLowerCase(),
      chain: CHAIN_NAME,
      project: 'stake.link-liquid',
      symbol,
      tvlUsd: tvl,
      apyBase: apy,
    };
  } catch (error) {
    console.error('Error fetching pool data:', error.message);
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
  url: 'https://stake.link/staking-pools',
};
