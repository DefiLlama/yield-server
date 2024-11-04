
const utils = require('../utils');
const superagent = require('superagent');



const WETHARB = "0x272dF896f4D0c97F65e787f861bb6e882776a155";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

const abis = {
  swapPool: {
    coverage: "function coverage() external view returns (uint256 reserves_, uint256 liabilities_)"
  }
}

const poolsFunction = async () => {
  
  const tvl = await utils.makeMulticall(abis.swapPool.coverage, [WETHARB], 'arbitrum');
  const key = `arbitrum:${WETH}`.toLowerCase();
  const usdcInUSDEth = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;
  console.log("usdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEth");
  console.log(usdcInUSDEth);


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

  const wethPoolARB = {
    pool: `${WETHARB}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'nabla',
    symbol: utils.formatSymbol('WETH'),
    underlyingTokens: [WETH],
    tvlUsd: tvl[0].liabilities_,
    apy: 100,
  };

  return [wethPoolARB]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nabla.fi/pools',
};