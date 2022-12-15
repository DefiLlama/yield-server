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
// v1 pools (read only) and private hypervisors ( non retail)
const ro_hypervisors = {
              ethereum:["0xd930ab15c8078ebae4ac8da1098a81583603f7ce",
                        "0xdbaa93e030bf2983add67c851892a9e2ee51e66a",
                        "0x586880065937a0b1b9541723619b75739df8ef13",
                        "0x33412fef1af035d6dba8b2f9b33b022e4c31dbb4",
                        "0xf6eeca73646ea6a5c878814e6508e87facc7927c",
                        "0x336d7e0a0f87e2729c0080f86801e6f4becf146f",
                        "0xc86b1e7fa86834cac1468937cdd53ba3ccbc1153",
                        "0x85cbed523459b7f6f81c11e710df969703a8a70c",
                        "0x7f92463e24b2ea1f7267aceed3ad68f7a956d2d8",
                        "0x23c85dca3d19b31f14aeea19beac32c2cb2ffc72",
                        "0x5230371a6d5311b1d7dd30c0f5474c2ef0a24661",
                        "0xc14e7ec60699a39cfd59bae06168afc2c76f32ac",
                        "0xbff4a47a0f77637f735e3a0ce10ff2bf9be12e89",
                        "0x93acb12ae1effb3426220c20c6d408eeaae59d72",
                        "0x65bc5c6a2630a87c2b494f36148e338dd76c054f",
                        "0xed354a827d99992d9cdada809449985cb73b8bb1",
                        "0xb666bfdb553a1aff4042c1e4f39e43852ba9731d",
                        "0xbb9b86a75ca3115caab045e2af17b0bba483acbc",
                        "0x0407c810546f1dc007f01a80e65983072d5c6dfa",
                        "0x4564a37c88e3b13d3a0c08832dcf88278997e6fe",
                        "0xd8dbdb77305898365d7ba6dd438f2663f7d4e409",
                        "0x33682bfc1d94480a0e3de0a565180b182b71d485",
                        "0x53a4512bbe5083695d8e890789fe1cf6f5686d52",
                        "0x09b8d86c6275e707155cdb5963cf611a432ccb21",
                        "0xc92ff322c8a18e38b46393dbcc8a7c5691586497",
                        "0x6e67bb258b6485b688cbb526c868d4428b634cf1",
                        "0x18d3284d9eff64fc97b64ab2b871738e684aa151",
                        "0x407e99b20d61f245426031df872966953909e9d3",
                        "0x97491b65c9c8e8754b5c55ed208ff490b2ee6190",
                        "0x6c8116abe5c5f2c39553c6f4217840e71462539c",
                        "0x716bd8a7f8a44b010969a1825ae5658e7a18630d",
                        "0x9a98bffabc0abf291d6811c034e239e916bbcec0",
                        "0xe065ff6a26f286ddb0e823920caaecd1fcd57ba1",
                        "0x5d40e4687e36628267854d0b985a9b6e26493b74",
                        "0xf0a9f5c64f80fa390a46b298791dab9e2bb29bca",
                        "0xe14dbb7d054ff1ff5c0cd6adac9f8f26bc7b8945",
                        "0xa625ea468a4c70f13f9a756ffac3d0d250a5c276",
                          ],
              optimism:[],
              polygon: [],
              arbitrum: [],
              celo: []
};
const getUrl_allData = (chain) =>
  `https://gammawire.net/${chain}hypervisors/allData`;

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

  const hype_allData = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => [
        chain,
        await utils.getData(getUrl_allData(CHAINS_API[chain])),
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

    const chainAprs = chainHypervisors.filter(function(hyp) {
      if (ro_hypervisors[chain].indexOf(hyp.id) >= 0){
        return false;
      }else{ 
        return true;
      };
      }).map((hypervisor) => {
      
            // MAIN CALC 
          const TVL =
              (hypervisor.tvl0/(10**hypervisor.pool.token0.decimals) ) * prices[`${chain}:${hypervisor.pool.token0.id}`]?.price +
              (hypervisor.tvl1/(10**hypervisor.pool.token1.decimals) ) * prices[`${chain}:${hypervisor.pool.token1.id}`]?.price;
          const apy = hype_allData[chain][hypervisor.id]["returns"]["daily"]["feeApy"];
          const apr = hype_allData[chain][hypervisor.id]["returns"]["daily"]["feeApr"];
          const TVL_alternative = Number(hypervisor.tvlUSD);
         
          
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
            apyBase: apr*100 || apy*100,
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
