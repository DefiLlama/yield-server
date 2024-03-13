const utils = require('../utils');
const axios = require('axios');
const { BalancerSDK } = require('@balancer-labs/sdk');
const BEETHOVEN_API = require('./query');
const processBeethovenAPR = require('./utils/processBeethovenAPR');

const API_URL = 'https://app.gyro.finance/pools/';

const SUPPORTED_CHAINS = {
  1: {
    name: 'ethereum',
    rpcUrl:
      'https://eth-mainnet.g.alchemy.com/v2/t0aumdpjEYRonvcR7PFZhD8TJGjoTil9',
    coingeckoId: 'ethereum',
  },
  10: {
    name: 'optimism',
    rpcUrl:
      'https://opt-mainnet.g.alchemy.com/v2/VxaW_1W6c4kIGUlm5nX_ZgTZmhAkP6vL',
    coingeckoId: 'optimistic-ethereum',
  },
  137: {
    name: 'polygon',
    rpcUrl: 'https://polygon-rpc.com',
    coingeckoId: 'polygon-pos',
  },
};

const BAL = {
  1: '0xba100000625a3754423978a60c9317c58a424e3d',
  10: '0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921',
  137: '0xba100000625a3754423978a60c9317c58a424e3d',
};

function fetchPools(chainId) {
  const data = utils.getData(
    API_URL + SUPPORTED_CHAINS[chainId].name + '.json'
  );
  return data;
}

async function fetchPoolTVL(balancerPool, chainId) {
  const tokenPrices = await Promise.all(
    balancerPool.tokens.map(async (token) => {
      const endpoint =
        'https://europe-west2-gyroscope-ui.cloudfunctions.net/getPrice';

      const res = await axios.post(endpoint, {
        networkId: SUPPORTED_CHAINS[chainId].coingeckoId,
        tokenAddress: token.address,
      });
      return res.data;
    })
  );

  const poolTVL = balancerPool.tokens.reduce((acc, token, index) => {
    const price = tokenPrices[index];
    const value = Number(price) * Number(token.balance);
    return acc + value;
  }, 0);

  return poolTVL;
}

async function fetchAPY(balancerSDK, balancerPool, isOptimism) {
  let apr;

  if (isOptimism) {
    const res = await axios.post(
      'https://backend-v3.beets-ftm-node.com/',
      {
        query: BEETHOVEN_API,
        variables: { id: balancerPool.id.toLowerCase() },
      },
      {
        headers: {
          chainId: '10',
        },
      }
    );

    const beethovenApr = res?.data?.data?.pool?.dynamicData?.apr;

    apr = processBeethovenAPR(beethovenApr);
  } else {
    apr = await balancerSDK.pools.apr(balancerPool);
  }

  const protocolFees = (apr.protocolApr ?? 0) / 100;
  const swapFees = (apr.swapFees ?? 0) / 100;
  const apyBase = swapFees + protocolFees;

  const incentiveRewardsAPR = (apr?.rewardAprs?.total ?? 0) / 100;
  const lstRewards = (apr?.tokenAprs?.total ?? 0) / 100;
  const balRewards = (apr?.stakingApr?.min ?? 0) / 100;
  const stETHApr = apr?.stETHApr ?? 0;
  const apyReward = incentiveRewardsAPR + lstRewards + balRewards + stETHApr;

  return {
    apyBase,
    apyReward,
  };
}

const apy = async () => {
  const poolsWithAPY = await Promise.all(
    Object.keys(SUPPORTED_CHAINS).map(async (chainId, i) => {
      chainId = Number(chainId);
      const config = {
        network: chainId,
        rpcUrl: SUPPORTED_CHAINS[chainId].rpcUrl,
      };

      const pools = await fetchPools(chainId);

      const balancerSDK = new BalancerSDK(config);

      const formattedPools = await Promise.all(
        pools.map(async (pool) => {
          const balancerPool = await balancerSDK.pools.find(pool.id);

          const poolTVL = await fetchPoolTVL(balancerPool, chainId);

          const { apyBase, apyReward } = await fetchAPY(
            balancerSDK,
            balancerPool,
            chainId === 10
          );

          return {
            pool: `${pool.address}-${SUPPORTED_CHAINS[chainId].name}`,
            chain: utils.formatChain(SUPPORTED_CHAINS[chainId].name),
            project: 'gyroscope-protocol',
            symbol: pool.tokens.map(({ symbol }) => symbol).join('-'),
            tvlUsd: poolTVL,
            apyBase,
            apyReward,
            rewardTokens:
              apyReward > 0 ? pool.rewardTokens ?? [BAL[chainId]] : [],
          };
        })
      );

      return formattedPools;
    })
  );

  return poolsWithAPY.flat();
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.gyro.finance',
};
