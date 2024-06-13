const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const { zenBullAbi, eulerSimpleLens } = require('./abi');

const poolsFunction = async () => {
  const API_URLS = {
    ethereum: sdk.graph.modifyEndpoint('9VC95zuTxcMhXxU25qQkEK2akFzE3eEPiBZGXjGbGcbA'),
  };
  const currentTimestamp = new Date().getTime() / 1000;
  const startTimestamp = currentTimestamp - 60 * 60 * 24 * 7;
  // get eth usd price
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins[key].price;
  // get squeeth usd price
  const squeethKey = 'ethereum:0xf1b99e3e573a1a9c5e6b2ce818b617f0e664e86b';
  const squeethPriceUSD = (
    await superagent.get(`https://coins.llama.fi/prices/current/${squeethKey}`)
  ).body.coins[squeethKey].price;
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

  /**************** Crab strategy APY and TVL ****************/
  // crab strategy vault in squeeth
  const crabVaultQuery = gql`
    query Vault($vaultID: ID! = 286) {
      vault(id: $vaultID) {
        id
        shortAmount
        collateralAmount
        NftCollateralId
        owner {
          id
        }
        operator
      }
    }
  `;
  const crabVaultQueryData = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => [
      chain,
      (await request(url, crabVaultQuery)).vault,
    ])
  );

  const crabTvl =
    (crabVaultQueryData[0][1].collateralAmount * ethPriceUSD) / 1e18 -
    (crabVaultQueryData[0][1].shortAmount * squeethPriceUSD) / 1e18;

  // weekly apy
  let crabApyData = (
    await utils.getData(
      `https://data-dot-mm-bot-prod.uc.r.appspot.com/metrics/crabv2?start_timestamp=${startTimestamp}&end_timestamp=${currentTimestamp}`
    )
  ).data;
  crabApyData = crabApyData[crabApyData.length - 1];
  const historicalUsdcReturns = crabApyData.crabPnL * 100;
  const crabNumberOfDays =
    (Number(currentTimestamp) - Number(startTimestamp)) / (60 * 60 * 24);
  const annualizedUsdcReturns =
    (Math.pow(1 + historicalUsdcReturns / 100, 365 / crabNumberOfDays) - 1) *
    100;

  // inception apy
  const crabStartTimestamp = '1658966400';
  let crabApyDataInception = (
    await utils.getData(
      `https://data-dot-mm-bot-prod.uc.r.appspot.com/metrics/crabv2?start_timestamp=${crabStartTimestamp}&end_timestamp=${currentTimestamp}`
    )
  ).data;
  crabApyDataInception = crabApyDataInception[crabApyDataInception.length - 1];

  const crabNumberOfDaysInception =
    (Number(currentTimestamp) - Number(crabStartTimestamp)) / (60 * 60 * 24);

  const annualizedUsdcReturnsInception =
    (Math.pow(
      1 + (crabApyDataInception.crabPnL * 100) / 100,
      365 / crabNumberOfDaysInception
    ) -
      1) *
    100;
  console.log(annualizedUsdcReturns);

  const chain = 'ethereum';
  const usdcPool = {
    pool: `${usdc}-${chain}`,
    chain: chain,
    project: 'opyn-squeeth',
    symbol: 'USDC',
    tvlUsd: crabTvl,
    apyBase: annualizedUsdcReturns,
    apyBaseInception: annualizedUsdcReturnsInception,
    poolMeta: 'Crab USDC',
  };

  // affected by euler hack
  // /**************** Zen Bull strategy APY and TVL ****************/
  // const zenBullAddress = '0xb46Fb07b0c80DBC3F97cae3BFe168AcaD46dF507';
  // const eulerSimpleLensAddress = '0x5077B7642abF198b4a5b7C4BdCE4f03016C7089C';
  // const [ethInCrab, squeethInCrab] = (
  //   await sdk.api.abi.call({
  //     target: zenBullAddress,
  //     abi: zenBullAbi.find(({ name }) => name === 'getCrabVaultDetails'),
  //     chain: 'ethereum',
  //   })
  // ).output;
  // const bullCrabBalance = (
  //   await sdk.api.abi.call({
  //     target: zenBullAddress,
  //     abi: zenBullAbi.find(({ name }) => name === 'getCrabBalance'),
  //     chain: 'ethereum',
  //   })
  // ).output;
  // const crab = '0x3B960E47784150F5a63777201ee2B15253D713e8';
  // const crabTotalSupply = (
  //   await sdk.api.erc20.totalSupply({
  //     target: crab,
  //     chain: 'ethereum',
  //   })
  // ).output;
  // const bullDtokenBalance = (
  //   await sdk.api.abi.call({
  //     target: eulerSimpleLensAddress,
  //     abi: eulerSimpleLens.find(({ name }) => name === 'getDTokenBalance'),
  //     params: [usdc, zenBullAddress],
  //     chain: 'ethereum',
  //   })
  // ).output;
  // const bullEtokenBalance = (
  //   await sdk.api.abi.call({
  //     target: eulerSimpleLensAddress,
  //     abi: eulerSimpleLens.find(({ name }) => name === 'getETokenBalance'),
  //     params: [weth, zenBullAddress],
  //     chain: 'ethereum',
  //   })
  // ).output;

  // const crabUsdPrice =
  //   ((ethInCrab * ethPriceUSD) / 1e18 -
  //     (squeethInCrab * squeethPriceUSD) / 1e18) /
  //   (crabTotalSupply / 1e18);
  // const zenBullTvl =
  //   (bullEtokenBalance * ethPriceUSD) / 1e18 +
  //   (bullCrabBalance * crabUsdPrice) / 1e18 -
  //   bullDtokenBalance / 1e6;

  // // weekly apy
  // let zenBullApyData = (
  //   await utils.getData(
  //     `https://data-dot-mm-bot-prod.uc.r.appspot.com/metrics/zenbull/pnl/${startTimestamp}/${currentTimestamp}`
  //   )
  // ).data;
  // zenBullApyData = zenBullApyData[zenBullApyData.length - 1];
  // const historicalWethReturns = zenBullApyData.bullEthPnl;
  // const zenBullNumberOfDays =
  //   (Number(currentTimestamp) - Number(startTimestamp)) / (60 * 60 * 24);
  // const annualizedWethReturns =
  //   (Math.pow(1 + historicalWethReturns / 100, 365 / zenBullNumberOfDays) - 1) *
  //   100;

  // // inception apy
  // const zenBullStartTimestamp = '1671500159';
  // let zenBullApyDataInception = (
  //   await utils.getData(
  //     `https://data-dot-mm-bot-prod.uc.r.appspot.com/metrics/zenbull/pnl/${zenBullStartTimestamp}/${currentTimestamp}`
  //   )
  // ).data;
  // zenBullApyDataInception =
  //   zenBullApyDataInception[zenBullApyDataInception.length - 1];
  // const historicalWethReturnsInception = zenBullApyDataInception.bullEthPnl;

  // const zenBullNumberOfDaysInception =
  //   (Number(currentTimestamp) - Number(zenBullStartTimestamp)) / (60 * 60 * 24);

  // const annualizedWethReturnsInception =
  //   (Math.pow(
  //     1 + historicalWethReturnsInception / 100,
  //     365 / zenBullNumberOfDaysInception
  //   ) -
  //     1) *
  //   100;

  // const zenBullChain = 'ethereum';
  // const wethPool = {
  //   pool: `${weth}-${zenBullChain}`,
  //   chain: zenBullChain,
  //   project: 'opyn-squeeth',
  //   symbol: 'WETH',
  //   tvlUsd: zenBullTvl,
  //   apyBase: annualizedWethReturns,
  //   apyBaseInception: annualizedWethReturnsInception,
  //   poolMeta: 'Zen Bull ETH',
  // };

  return [usdcPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://squeeth.opyn.co/strategies/',
};
