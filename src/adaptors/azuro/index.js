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
    liquidityPoolContracts(
      where: {address_not_in: ["0x2a838ab9b037db117576db8d0dcc3b686748ef7c", "0xac004b512c33d029cf23abf04513f1f380b3fd0a"]}
    ) {
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
        chain: chain,
        project: 'azuro',
        symbol: utils.formatSymbol(pool.asset),
        tvlUsd: Number(pool.tvl),
        apyBase: apr ? Number(apr.aprDayAgo) : Number(pool.apr),
        poolMeta: '7 day lockup',
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
