const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const axios = require('axios');

const START_TIME = 1732071601; // First silo yield distribution at Season 4.
const API = 'https://api.pinto.money/silo/yield';
const SUBGRAPH = 'https://graph.pinto.money/pinto/';

const PINTO = '0xb170000aeefa790fa61d6e837d1035906839a3c8';
const PINTO_DIAMOND = '0xd1a0d188e861ed9d15773a2f3574a2e94134ba8f';
const PRICE_CONTRACT = '0xD0fd333F7B30c7925DEBD81B7b7a4DFE106c3a5E';

const PRICE_ABI = {
  inputs: [],
  name: 'price',
  outputs: [
    {
      components: [
        {
          internalType: 'uint256',
          name: 'price',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'liquidity',
          type: 'uint256',
        },
        {
          internalType: 'int256',
          name: 'deltaB',
          type: 'int256',
        },
        {
          components: [
            {
              internalType: 'address',
              name: 'pool',
              type: 'address',
            },
            {
              internalType: 'address[2]',
              name: 'tokens',
              type: 'address[2]',
            },
            {
              internalType: 'uint256[2]',
              name: 'balances',
              type: 'uint256[2]',
            },
            {
              internalType: 'uint256',
              name: 'price',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'liquidity',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'beanLiquidity',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'nonBeanLiquidity',
              type: 'uint256',
            },
            {
              internalType: 'int256',
              name: 'deltaB',
              type: 'int256',
            },
            {
              internalType: 'uint256',
              name: 'lpUsd',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'lpBdv',
              type: 'uint256',
            },
          ],
          internalType: 'struct P.Pool[]',
          name: 'ps',
          type: 'tuple[]',
        },
      ],
      internalType: 'struct BeanstalkPrice.Prices',
      name: 'p',
      type: 'tuple',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

// Returns total deposited + germinating token amounts of the requested token
async function getSiloDeposited(token) {
  const deposited = await sdk.api.abi.call({
    abi: 'function getTotalDeposited(address) external view returns (uint256)',
    target: PINTO_DIAMOND,
    params: token,
    chain: 'base',
  });
  const germinating = await sdk.api.abi.call({
    abi: 'function getGerminatingTotalDeposited(address) external view returns (uint256)',
    target: PINTO_DIAMOND,
    params: token,
    chain: 'base',
  });
  return BigInt(deposited.output) + BigInt(germinating.output);
}

// Returns the deposited TVL of the requested token.
async function getDepositedTVL(token) {
  // Only PINTO is supported for onchain TVL
  if ((token || '').toLowerCase() !== PINTO.toLowerCase()) {
    return null;
  }

  const depositedTokens = await getSiloDeposited(token);
  const priceResult = await sdk.api.abi.call({
    abi: PRICE_ABI,
    target: PRICE_CONTRACT,
    chain: 'base',
  });
  const price = BigInt(priceResult.output[0]);

  // Tokens and price each have 6 decimals
  return Number(depositedTokens * price) / 10 ** 12;
}

async function getPools(timestamp = null) {
  const pools = await getPoolsForChain('base', timestamp);
  return pools.flat();
}

async function getPoolsForChain(chain, timestamp) {
  if (timestamp && timestamp < START_TIME) {
    return [];
  }

  const resultPools = [];

  // When a timestamp is specified, determine which block to use
  let block;
  if (timestamp) {
    [block] = await utils.getBlocksByTime([timestamp], chain);
  }

  // Query subgraph to identify each yield-bearing pool and its info
  const poolData = await request(
    SUBGRAPH,
    gql`
    {
      beans${block ? `(block: {number: ${block}})` : ''} {
        id
        currentSeason {
          season
        }
        pools {
          id
          liquidityUSD
          tokens {
            id
            name
          }
        }
      }
    }`
  );

  for (const bean of poolData.beans) {
    // Get apy info
    const apy = await axios.post(API, {
      season: bean.currentSeason.season,
      emaWindows: [720],
      options: {
        initType: 'NEW',
      },
    });
    // Uses the available window if fewer datapoints were available
    const yields = apy.data.yields[Object.keys(apy.data.yields)[0]];
    const pools = bean.pools.filter((p) => yields[p.id]);

    // Add results for each silo asset
    for (const token in yields) {
      let tokens;
      let tvlUsd;
      const pool = pools.find((p) => p.id === token);
      if (pool) {
        // Sort PINTO to be first in the token list
        tokens =
          pool.tokens[0].name === 'PINTO'
            ? pool.tokens
            : [pool.tokens[1], pool.tokens[0]];
        tvlUsd = parseInt(pool.liquidityUSD);
      } else {
        // Non-pool token: only PINTO is supported; skip others
        tvlUsd = await getDepositedTVL(token);
        if (tvlUsd === null) {
          // Unsupported token, skip adding this pool
          continue;
        }
        tokens = [{ id: token, name: 'PINTO' }];
      }

      resultPools.push({
        pool: `${token}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'pinto',
        symbol: `${tokens.map((t) => t.name).join('-')}`,
        tvlUsd,
        apyReward: Math.round(yields[token].bean * 10000) / 100,
        rewardTokens: [bean.id],
        underlyingTokens: tokens.map((t) => t.id.toLowerCase()),
        poolMeta: 'Pinto Silo',
      });
    }
  }
  return resultPools;
}

module.exports = {
  timetravel: true,
  apy: getPools,
  url: 'https://pinto.money/',
};
