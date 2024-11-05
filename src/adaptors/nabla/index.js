
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const { request, gql } = require('graphql-request');
const { format } = require('date-fns');
const { default: address } = require('../paraspace-lending-v1/address');


const WEEKS_IN_YEAR = 52.142;

const abis = {
  swapPool: {
    coverage: "function coverage() external view returns (uint256 reserves_, uint256 liabilities_)",
    chargedSwapFeesEvent: 'event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)'

  }
}

const graphUrls = {
  arbitrum: "https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha/api",
}

const query = gql`
  query getSwapPools {
    swapPools {
      id
			liabilities
      apr7d
      token {
        id
      }
    }
  }
`

const getPriceKey = (address, chain) => `${chain}:${address}`;

const poolsFunction = async () => {
  const chain = 'arbitrum';

  const swapPools = (await request(graphUrls.arbitrum, query)).swapPools;


  const tokens = swapPools.map((p) => p.token.id);
  const [symbolsRes, decimalsRes] = await Promise.all(
    ['function symbol() external view returns(string memory)', 'erc20:decimals'].map(
      async (m) =>
        await sdk.api.abi.multiCall({
          chain: 'arbitrum',
          calls: tokens.map((i) => ({ target: i })),
          abi: m,
        })
    )
  );
  const symbols = symbolsRes.output.map((o) => o.output);
  const decimals = decimalsRes.output.map((o) => o.output);

  const priceKeys = [...new Set(tokens)].map(
    (address) => getPriceKey(address, chain)
  );
  const usdPrices = ( await superagent.get(
    `https://coins.llama.fi/prices/current/${priceKeys
      .join(',')
      .toLowerCase()}`
    )
  ).body.coins;

  return swapPools.map((swapPool, i) => {
    const {      
      id: pool,
			liabilities: tvl,
      apr7d,
      token
    } = swapPool;
    const tokenAddress = token.id;

    const key = getPriceKey(tokenAddress, chain);
  
    return  {
      pool: `${pool}-arbitrum`,
      chain: utils.formatChain(chain),
      project: "nabla",
      symbol: utils.formatSymbol(symbols[i]),
      underlyingTokens: [tokenAddress],
      tvlUsd: (BigNumber(tvl)/(10**decimals[i]) * usdPrices[key].price), 
      apyBase: apr7dToApy(apr7d/(10**decimals[i])),
    };
  });
};
const apr7dToApy = (apr) => {
  const aprDay = apr / 365;
  return ((1 + aprDay) ** 365) - 1;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nabla.fi/pools',
};