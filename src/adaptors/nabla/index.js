
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const { request, gql } = require('graphql-request');


const WETHARB = "0x272dF896f4D0c97F65e787f861bb6e882776a155";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

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
const poolsFunction = async () => {
  const swapPools = (await request(graphUrls.arbitrum, query)).swapPools;
  const {id: pool, liabilities: tvl, apr7d, token } = swapPools[0];
  const tokenAddress = token.id;

  const tokens = [tokenAddress];

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
  
  // const tvl = await utils.makeMulticall(abis.swapPool.coverage, [WETHARB], 'arbitrum');
  const key = `arbitrum:${tokenAddress}`.toLowerCase();
  const usdcPrice = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;
  console.log("usdcPrice", usdcPrice);
  console.log("tvl", tvl);
  console.log("tokenAddress", tokenAddress);

  // const blockNow = await sdk.api.util.getLatestBlock("arbitrum")

  // const timestampNow = Math.floor(Date.now() / 1000);
  // const timestamp7dayAgo = timestampNow - 86400 * 7;
  // const ARB_BLOCK_TIME = 0.25;
  // const fromBlockNumber = blockNow.block - Math.round(timestamp7dayAgo * ARB_BLOCK_TIME);

  // const feeLog = await sdk.api2.util.getLogs({
  //   target: WETHARB,
  //   topic: abis.swapPool.chargedSwapFeesEvent,
  //   chain: 'arbitrum',
  //   fromBlock: fromBlockNumber,
  //   toBlock: blockNow.block,
  // })
  // console.log("usdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEth");
  // console.log(feeLog);
  // const makeMulticall = async (abi, addresses, chain, params = null) => {
  //   const data = await sdk.api.abi.multiCall({
  //     abi,
  //     calls: addresses.map((address) => ({
  //       target: address,
  //       params,
  //     })),
  //     chain,
  //     permitFailure: true,
  //   });
  console.log("usdcPrice", usdcPrice);
  console.log("tvl", tvl);
  console.log(BigNumber(usdcPrice))
  console.log("decimals", decimals[0])
  console.log("apr7d", apr7d);
const WEEKS_IN_YEAR = 52.142;
  const wethPoolARB = {
    pool: `${pool}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: "nabla",
    symbol: utils.formatSymbol(symbols[0]),
    underlyingTokens: [tokenAddress],
    tvlUsd: (BigNumber(tvl)/(10**decimals[0]) * usdcPrice), 
    // tvlUsd: 0,
    apyBase: apr7d * WEEKS_IN_YEAR / 1e6,
  };

  return [wethPoolARB]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nabla.fi/pools',
};