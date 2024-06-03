const { BigNumber, constants, utils } = require('ethers');
const { request, gql } = require('graphql-request');
const { api } = require("@defillama/sdk");

// endpoints
const subgraphUrl = "https://api.studio.thegraph.com/query/41372/spool-v2_mainnet/version/latest";

// queries
const q = gql`
  query MyQuery($smartVault: ID) {
    smartVaultStrategies(where: {smartVault: $smartVault}) { 
      strategy { apy }
      allocation
    }
  }`

// abis
const abi = {
  "getSmartVaultAssetBalances": "function getSmartVaultAssetBalances(address, bool) external returns (uint256[] memory)",
  "getAmountsOut": "function getAmountsOut(uint256, address[] memory) external view returns (uint256[] memory)",
  "rewardConfiguration": "function rewardConfiguration(address, address) public view returns(uint32,uint32,uint192,uint32)",
  "assetToUsd": "function assetToUsd(address, uint256) public view returns(uint256)"
}

// contracts
const dai = "0x6b175474e89094c44da98b954eedeac495271d0f";
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const spool = '0x40803cea2b2a32bda1be61d3604af6a814e70976';
const vault = '0x5d6ac99835b0dd42ed9ffc606170e59f75a88fde'; // srETH vault
const spoolLens = "0x8aa6174333f75421903b2b5c70ddf8da5d84f74f";
const rewardManager = "0xd8d2c1c3c7982272e3e12dec5af681433fdcf003";
const uniswapRouterV2 = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
const usdPriceFeedManager = "0x38f1a78ad8956b45b48837657bd0884ba7ab485a";

// constants
const SECONDS_PER_YEAR = 31536000;
const url = `https://app.spool.fi/`
const urlVault = `${url}smart-vaults/${vault}/`

// helpers
const call = async(target, abi, params) => (await api.abi.call({target: target, abi: abi, params: params, chain: "ethereum"})).output;

// functions
const getTvlUsdRaw = async() => {
    const tvlETH = await call(spoolLens, abi["getSmartVaultAssetBalances"], [vault, false]);
    const ethPrice = await call(usdPriceFeedManager, abi["assetToUsd"], [weth, constants.WeiPerEther.toString()]);
    return BigNumber.from(tvlETH[0]).mul(ethPrice).div(constants.WeiPerEther);
}

const getApyBase = async() => {
    const apyBase = (await request(subgraphUrl, q, { smartVault: vault }))
        .smartVaultStrategies
        .reduce((a, b) => a + ((b.strategy.apy * b.allocation) / 100), 0);
    return apyBase;
}

const getApyReward = async (tvlUsdRaw) => {
    const [rewardsDuration, periodFinish, rewardRate, tokenAdded] = 
    await call(rewardManager, abi["rewardConfiguration"], [vault, spool]);

    const timestampNow = Math.floor(Date.now() / 1_000);
    if(Number(periodFinish) < timestampNow) return 0;

    // get reward token distributed yearly in USD
    const spoolPrice = await call(uniswapRouterV2, abi["getAmountsOut"], [constants.WeiPerEther.toString(), [spool, dai]]);
    const spoolYearlyDistributionUsdRaw = BigNumber.from(rewardRate).mul(SECONDS_PER_YEAR).mul(spoolPrice[1]); 

    let apyReward = Number(utils.formatUnits(
        spoolYearlyDistributionUsdRaw.div(tvlUsdRaw.mul(constants.WeiPerEther))
    )) * 100;

    return apyReward;

}

const getApy = async () => {
  const tvlUsdRaw = await getTvlUsdRaw();
  const tvlUsd = Number(utils.formatUnits(tvlUsdRaw));
  const apyBase = await getApyBase();
  const apyReward = await getApyReward(tvlUsdRaw);

  return [
    {
      pool: vault,
      chain: 'ethereum',
      project: 'staking-rewards-sreth',
      symbol: 'srETH',
      tvlUsd: tvlUsd,
      apyBase: apyBase,
      apyReward: apyReward,
      rewardTokens: [spool],
      underlyingTokens: [weth],
      url: urlVault,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: url,
};
