
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');




const WETHARB = "0x272dF896f4D0c97F65e787f861bb6e882776a155";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

const abis = {
  swapPool: {
    coverage: "function coverage() external view returns (uint256 reserves_, uint256 liabilities_)",
    chargedSwapFeesEvent: 'event ChargedSwapFees(uint256 lpFees, uint256 backstopFees, uint256 protocolFees)'

  }
}

const poolsFunction = async () => {
  
  const tvl = await utils.makeMulticall(abis.swapPool.coverage, [WETHARB], 'arbitrum');
  const key = `arbitrum:${WETH}`.toLowerCase();
  const usdcInUSDEth = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;

  const blockNow = await sdk.api.util.getLatestBlock("arbitrum")

  const timestampNow = Math.floor(Date.now() / 1000);
  const timestamp7dayAgo = timestampNow - 86400 * 7;
  const ARB_BLOCK_TIME = 0.25;
  const fromBlockNumber = blockNow.block - Math.round(timestamp7dayAgo * ARB_BLOCK_TIME);

  const feeLog = await sdk.api2.util.getLogs({
    target: WETHARB,
    topic: abis.swapPool.chargedSwapFeesEvent,
    chain: 'arbitrum',
    fromBlock: fromBlockNumber,
    toBlock: blockNow.block,
  })
  console.log("usdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEthusdcInUSDEth");
  console.log(feeLog);
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
    tvlUsd: BigNumber(tvl[0].liabilities_) * BigNumber(usdcInUSDEth) /BigNumber(1e18),
    apy: 100,
  };

  return [wethPoolARB]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.nabla.fi/pools',
};