const sdk = require('@defillama/sdk');
const axios = require('axios');
const { GraphQLClient, gql } = require('graphql-request');

const atETH = '0xc314b8637B05A294Ae9D9C29300d5f667c748baD';
const atUSD = '0xc4af68Dd5b96f0A544c4417407773fEFDc97F58d';
const project = 'latch';
const symbolU = 'atUSD';
const symbolE = 'atETH';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const gqlEndpoint = 'https://savings-graphigo.prd.latch.io/query';
const graphClient = new GraphQLClient(gqlEndpoint);
const NAV = '0x5D3920CCC068039E5B6FE680CaB7Aa09fE8E053C';
const abi = 'function getNavByTimestamp(address,uint48) view returns (uint256 , uint48 )';
const eth = '0x0000000000000000000000000000000000000000'
const usdt = '0xdac17f958d2ee523a2206206994597c13d831ec7'


const apyQuery = gql`
 query GetAPYs($lsdToken: String!) {\n  GetAPYs(lsdToken: $lsdToken)\n}
`;

const timestamp = Math.floor(Date.now() / 1000);

const apy = async () => {
  const tvlUsd =
    (await sdk.api.erc20.totalSupply({ target: atUSD, chain: 'gravity' })).output /
    1e18;
  const tvlEth =
    (await sdk.api.erc20.totalSupply({ target: atETH, chain: 'gravity' })).output /
    1e18;


  const ethApi = new sdk.ChainApi({ chain: 'ethereum', timestamp: timestamp });
  await Promise.all([ethApi.getBlock()]);
  const [usdNav, ethNav] = await Promise.all([
    ethApi.call({ target: NAV, params: [atUSD, timestamp], abi }),
    ethApi.call({ target: NAV, params: [atETH, timestamp], abi }),
  ]);
  const usdNavNum = parseFloat(usdNav[0].toString());
  const ethNavNum = parseFloat(ethNav[0].toString());
  const usdtResult = (tvlUsd * usdNavNum) / Math.pow(10, 18);
  const ethResult = (tvlEth * ethNavNum) / Math.pow(10, 18);


  const ethPriceKey = `ethereum:${eth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${ethPriceKey}`)
  ).data.coins[ethPriceKey]?.price;
  const usdtPriceKey = `ethereum:${usdt}`;
  const usdtPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${usdtPriceKey}`)
  ).data.coins[usdtPriceKey]?.price;

  const { GetAPYs: atUsdApy } = await graphClient.request(apyQuery, { lsdToken: atUSD });
  const { GetAPYs: atEthApy } = await graphClient.request(apyQuery, { lsdToken: atETH });


  return [
    {
      pool: `${atETH}-gravity`,
      chain: 'Gravity',
      project,
      symbol: symbolE,
      underlyingTokens: [atETH],
      apyBase: Number(atEthApy) * 100,
      tvlUsd: ethResult * ethPrice,
    },
    {
      pool: `${atUSD}-gravity`,
      chain: 'Gravity',
      project,
      symbol: symbolU,
      underlyingTokens: [atUSD],
      apyBase: Number(atUsdApy) * 100,
      tvlUsd: usdtResult * usdtPrice,
    },
  ];
};

module.exports = { apy, url: 'https://savings.latch.io/' };
