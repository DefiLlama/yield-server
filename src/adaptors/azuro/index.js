const { gql, request } = require('graphql-request');
const utils = require('../utils');

const CHAINS = {
  gnosis: 'Gnosis',
  polygon: 'PolygonUSDT',
  chiliz: 'Chiliz',
};

const getUrl = (chain) => 
  `https://thegraph.azuro.org/subgraphs/name/azuro-protocol/azuro-api-${chain}-v3`;

const aprUrl = "https://api.azuro.org/apr";

const query = gql`
  {
    liquidityPoolContracts {
      apr
      address
      asset
      chainId
      chainName
      coreAddresses
      token
      tvl
    }
  }
`;

const fetchAprData = async () => {
  const { data } = await utils.getData(aprUrl);
  return data;
};

const fetchLiquidityPools = async (chain) => {
  const { liquidityPoolContracts } = await request(getUrl(chain), query);
  return liquidityPoolContracts;
};

const poolsFunction = async () => {
  const aprData = await fetchAprData();

  let pools = [];

  for (const chain of Object.keys(CHAINS)) {
    const liquidityPools = await fetchLiquidityPools(chain);

    liquidityPools.forEach(pool => {
      const apr = aprData.find(aprItem => aprItem.chain === CHAINS[chain]);
      pools.push({
        pool: pool.address,
        chain: pool.chainName,
        project: 'azuro',
        symbol: utils.formatSymbol(pool.asset),
        tvlUsd: Number(pool.tvl),
        apyBase: apr ? apr.apr : pool.apr,
      });
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://azuro.org/app/liquidity',
};
