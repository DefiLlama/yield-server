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
  'https://graph-readonly.linkpool.pro/subgraphs/name/stakedotlink-ethereum-production';

const linkQuery = `
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

const polQuery = `
 {
    totalRewardAmounts {
      totalRewardSTPOL
      __typename
    }
    totalCounts {
      polStakingDistributionCount
      __typename
    }
    polStakingDistributions(
      first: 1
      skip: 0
      orderBy: ts
      orderDirection: desc
      where: {isUpdatedWithBurnAmount: true}
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

const pools = [
  {
    symbol: 'stLINK',
    address: '0xb8b295df2cd735b15BE5Eb419517Aa626fc43cD5',
    priceId: 'chainlink',
    chain: 'Ethereum',
  },
  {
    symbol: 'stPOL',
    address: '0x2ff4390dB61F282Ef4E6D4612c776b809a541753',
    priceId: 'polygon-ecosystem-token',
    chain: 'Ethereum',
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
    const { symbol, address, priceId, chain } = pool;
    const price = await fetchPrice(priceId);

    // Use appropriate query and field names based on the token
    const query = symbol === 'stPOL' ? polQuery : linkQuery;
    const distributionField =
      symbol === 'stPOL'
        ? 'polStakingDistributions'
        : 'linkStakingDistributions';

    const response = await getData(SUBGRAPH_URL, JSON.stringify({ query }));

    if (
      !response ||
      !response.data ||
      !response.data[distributionField] ||
      !response.data[distributionField][0]
    ) {
      throw new Error(
        `Invalid data structure received from subgraph for ${symbol}`
      );
    }

    const distribution = response.data[distributionField][0];
    const apy = parseFloat(distribution.reward_rate);
    const totalStakedInWei = distribution.total_staked;
    const totalStaked = parseFloat(ethers.utils.formatEther(totalStakedInWei));
    const tvl = totalStaked * price;

    return {
      pool: `${address}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'stake.link-liquid',
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
  url: 'https://stake.link/',
};
