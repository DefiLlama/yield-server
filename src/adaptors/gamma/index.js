const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');



const CHAINS = {
    ethereum: 'gamma',
    optimism: 'optimism',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    celo: 'celo'
  };
const CHAINS_API = {
    ethereum: '',
    optimism: 'optimism/',
    polygon: 'polygon/',
    arbitrum: 'arbitrum/',
    celo: 'celo/'
  };
const CHAIN_IDS = {
    ethereum: 1,
    optimism: 10,
    polygon: 137,
    arbitrum: 42161,
    celo: 42220
  };

var pools_processed = []; // unique pools name

const getUrl_returns = (chain) =>
  `https://gammawire.net/${chain}hypervisors/returns`;

const getUrl = (chain) =>
`https://api.thegraph.com/subgraphs/name/gammastrategies/${chain}`;


const hypervisorsQuery = gql`
{
    uniswapV3Hypervisors(where: {  tvl0_gt: "0", totalSupply_gt: "0"}) {
      id
      symbol
      created
      tvlUSD
      pool {
        token0 {
          symbol
          id
          decimals
        }
        token1 {
          symbol
          id
          decimals
        }
        fee
      }
    }
  }
`;

const getSumByKey = (arr, key) => {
    return arr.reduce((accumulator, current) => accumulator + Number(current[key]), 0)
  }
const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const getApy = async () => {
  const hypervisorsDta = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => [
        chain,
        await request(getUrl(CHAINS[chain]), hypervisorsQuery),
      ])
    )
  );

  const hype_return = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => [
        chain,
        await utils.getData(getUrl_returns(CHAINS_API[chain])),
      ])
    )
  );

  const tokens = Object.entries(hypervisorsDta).reduce(
    (acc, [chain, { uniswapV3Hypervisors }]) => ({
      ...acc,
      [chain]: [
        ...new Set(
            uniswapV3Hypervisors
            .map((hypervisor) => [hypervisor.pool.token0.id, hypervisor.pool.token1.id])
            .flat()
        ),
      ],
    }),
    {}
  );

  const keys = [];
  for (const key of Object.keys(tokens)) {
    keys.push(tokens[key].map((t) => `${key}:${t}`));
  }


  const pools = Object.keys(CHAINS).map((chain) => {
    const { uniswapV3Hypervisors: chainHypervisors } = hypervisorsDta[chain];
    const { uniswapV3Hypervisors: returnHypervisors } = hype_return[chain];

    const chainAprs = chainHypervisors.filter(function(hyp) {
        return true;
      }).map((hypervisor) => {
      
      
      const TVL = Number(hypervisor.tvlUSD);
      const apy = hype_return[chain][hypervisor.id]["daily"]["feeApy"];
      const apr = hype_return[chain][hypervisor.id]["daily"]["feeApr"];

      // create a unique pool name
      var pool_name = hypervisor.id;
      if (pools_processed.indexOf(pool_name) >= 0){
        pool_name = `${hypervisor.id}-${utils.formatChain(chain)}`
      };
      pools_processed.push(pool_name);
    
      return {
        pool: pool_name,
        chain: utils.formatChain(chain),
        project: 'gamma',
        symbol: `${hypervisor.pool.token0.symbol}-${hypervisor.pool.token1.symbol}`,
        tvlUsd: TVL || 0,
        apyBase: apy || apr,
        underlyingTokens: [hypervisor.pool.token0.id, hypervisor.pool.token1.id],
      };
    });
    return chainAprs;
  });
  return pools.flat();
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.gamma.xyz/dashboard',
  };

  