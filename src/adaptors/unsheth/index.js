const unshETHFarm = require('./unsheth-farm');
const BNBunshETHFarm = require('./bnb-unsheth-farm');
const sushiFarm = require('./ush-weth-sushi');
const pancakeFarm = require('./ush-bnb-pancake');

//TODO: Notes for llama team:
// We calculate the yield for unshETH staking farms
// 1) We are calculating the base APR of unshETH based on the weighted average of the underlying LSD APR.
// -- For each of the underlying LSDs, we use their official API to pull their APR, except for cbETH
// -- For cbETH we use the DefiLlama calculation and import it directly since there's no official API (pls let us know if this is ok)
// 2) We are calculating the farm APR for unshETH based on the USH emissions
// .
// We are also including the yield for USH-ETH and USH-BNB LPs on Sushi and PancakeSwap.  These are pool2 yields:
// 1) For the base APR based on trading volume, we're pulling using Sushi and Pancakeswap APIs
// -- For the PancakeSwap API, we're using the NodeReal subgraph URL as used in official PancakeSwap repo. If there's a official Defillama API Key, pls let us know how to include it (we included a free API key)
// 2) Farm APR is based on the USH emissions
// .
// How do we get properly listed with the right attributes on Defillama?
// 1) We would like to represent unshETH as a single-sided ETH staking yield with no IL.
// -- For unshETH on ETH Mainnet, the underlying asset is mainnet ETH.  For the adapter, we said it is WETH (which is how cbETH adapter does it)
// -- For BNB Chain, the underlying asset is technically still mainnet ETH.  For the adapter, we said it is Binance-pegged ETH
// 2) We are an audited farm.  Audit link is: https://unsheth.xyz/v2-audit.pdf
// .
// Please reach out to wagmi33 on twitter or wagmi@unsheth.xyz if you have any questions


const getApy = async () => {
  let unshETHPool = await unshETHFarm.getPoolInfo();
  let bnbUnshETHPool = await BNBunshETHFarm.getPoolInfo();
  let sushiPool = await sushiFarm.getPoolInfo();
  let pancakePool = await pancakeFarm.getPoolInfo();

  return [
    unshETHPool,
    bnbUnshETHPool,
    sushiPool,
    pancakePool
  ]
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://unsheth.xyz'
};

