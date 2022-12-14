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
const custom_hyp = ["0x33682bfc1d94480a0e3de0a565180b182b71d485","0x6c8116abe5c5f2c39553c6f4217840e71462539c","0xd930ab15c8078ebae4ac8da1098a81583603f7ce","0xde8edc067b079b3965fde36d11aa834287f9b663","0xfb3a24c0f289e695ceb87b32fc18a2b8bd896167"];

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
      tvl0
      tvl1
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
      rebalances(orderBy: timestamp, orderDirection: desc, first: 100) {
        timestamp
        totalAmountUSD
        grossFeesUSD
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
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: keys.flat(),
    })
  ).body.coins;

  const pools = Object.keys(CHAINS).map((chain) => {
    const { uniswapV3Hypervisors: chainHypervisors } = hypervisorsDta[chain];
    const { uniswapV3Hypervisors: returnHypervisors } = hype_return[chain];

    const chainAprs = chainHypervisors.filter(function(hyp) {
        return true;
      }).map((hypervisor) => {
      
      
        // MAIN CALC 
      const TVL =
          (hypervisor.tvl0/(10**hypervisor.pool.token0.decimals) ) * prices[`${chain}:${hypervisor.pool.token0.id}`]?.price +
          (hypervisor.tvl1/(10**hypervisor.pool.token1.decimals) ) * prices[`${chain}:${hypervisor.pool.token1.id}`]?.price;
      var apy = hype_return[chain][hypervisor.id]["daily"]["feeApy"];
      const apr = hype_return[chain][hypervisor.id]["daily"]["feeApr"];
      const TVL_alternative = Number(hypervisor.tvlUSD);

      // a few pools have err apy: temporarely use rebalances to mitigate error
      if (custom_hyp.indexOf(hypervisor.id) >= 0){
        const aggregatedtvl = getSumByKey(hypervisor.rebalances, 'totalAmountUSD');
        const aggregatedfees = getSumByKey(hypervisor.rebalances, 'grossFeesUSD');
        const secs_passed = hypervisor.rebalances[0]?.timestamp-hypervisor.rebalances[hypervisor.rebalances.length-1]?.timestamp;
        const averageTVL = ((aggregatedtvl > aggregatedfees) ? (aggregatedtvl-aggregatedfees)/hypervisor.rebalances.length : aggregatedtvl/hypervisor.rebalances.length);
        const yearlyFees = ((aggregatedfees/secs_passed)*(60*60*24*365))
        const apr_alternative = yearlyFees/averageTVL
        apy = apr_alternative;
      }
      


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
        tvlUsd: TVL || TVL_alternative,
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
