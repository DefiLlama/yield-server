const SDK = require( "@defillama/sdk" );
const HelperUtils = require( "../../helper/utils" );
const AdaptorUtils = require( "../utils" );

const ybtcContract = "0xba3e932310CD1dBF5Bd13079BD3D6bAe4570886f";
const umjaContract = "0x16A500Aec6c37F84447ef04E66c57cfC6254cF92";
const chain = "Arbitrum";

async function umojaYbtcYield()
{
  // Refer: https://github.com/DefiLlama/DefiLlama-Adapters/blob/e8819d280c3edebbe87242ca2b487d5effbc3f3f/projects/umoja-ybtc/index.js
  const [reqApy, reqTotalSupply, reqPrice] = await Promise.all( [
    HelperUtils.fetchURL( "https://gateway-prod.umoja.services/smartcoins/global/apy" ),
    SDK.api.abi.call( { abi: 'erc20:totalSupply', target: ybtcContract, chain: "arbitrum" } ),
    AdaptorUtils.getPrices( [ybtcContract], chain )
  ] );

  return [{
    pool: `${ybtcContract}-${chain}`.toLowerCase(),
    chain: chain,
    project: "umoja-ybtc",
    symbol: "YBTC",
    tvlUsd: reqTotalSupply.output / 1e18 * reqPrice.pricesBySymbol.ybtc,
    apy: reqApy.data.YBTC,
    rewardTokens: [umjaContract], // UMJA.
    poolMeta: "YBTC",
  }];
};

module.exports = {
  timetravel: false,
  apy: umojaYbtcYield,
  url: "https://umoja.xyz/smartcoins",
};