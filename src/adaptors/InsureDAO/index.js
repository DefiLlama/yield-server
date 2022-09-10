const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');

const { sumTokens, sumTokensAndLPs, unwrapCrv, unwrapUniswapLPs, genericUnwrapCvx, } = require('../../helper/unwrapLPs');


const insureTokenContract = '0xd83AE04c9eD29d6D3E6Bf720C71bc7BeB424393E';
const gageAddress = '0xf57882cf186db61691873d33e3511a40c3c7e4da';
const uni = "0x1b459aec393d604ae6468ae3f7d7422efa2af1ca";
const uniStaking = "0xf57882cf186db61691873d33e3511a40c3c7e4da";
const InflationTrackerAddress = '0xf57882cf186db61691873d33e3511a40c3c7e4da';

const secondsPerYear = 31536000;

async function getRate(Chain) {
  let tvltemp = await sdk.api.abi.call({
    target: insureTokenContract,
    abi: abi['rate'],
    chain: Chain,
    params: [],
  });
  
  return tvltemp.output * 10 ** -18;
}

async function getPoolUniLp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pGauge_relative_weight,
  pInflationRate,
  pPriceData
) {
  console.log(pInflationRate);
  
  const yearlyInflationRate = pInflationRate * secondsPerYear * pGauge_relative_weight
  
  const yearlyInflationInsure = yearlyInflationRate  * pPriceData.insuredao.usd;
  console.log(yearlyInflationInsure); //465359.52557910985
  
  const apyInflation = (yearlyInflationInsure / pTvl) * 100;

  const chainString = 'Ethereum';

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'insuredao',
    symbol: utils.formatSymbol('INSURE-ETH'),
    tvlUsd: parseFloat(pTvl),
    // apyBase: 0,
    apyReward: apyInflation,
    rewardTokens: [insureTokenContract],
    underlyingTokens: [uni],
  };
}

async function gauge_relative_weight(Chain) {
  let gauge_relative_weight_value = await sdk.api.abi.call({
    target: '0x297ea2afcE594149Cd31a9b11AdBAe82fa1Ddd04',
    abi: abi['gauge_relative_weight'],
    chain: Chain,
    params: ['0xf57882cf186db61691873d33e3511a40c3c7e4da',0],
  });
  
  return gauge_relative_weight_value.output * 10 ** -18;;
}

async function pool2(timestamp, block) {
  const balances = {}
  await sumTokensAndLPs(balances, [
    [uni, uniStaking, true]
  ], block)
  return balances;
}

function getCoingeckoLock() {
  return new Promise((resolve) => {
    locks.push(resolve);
  });
}


const getPools = async () => {
  let pools = [];

  const balances = {};

  const LPbalances =await pool2();
  
  const uniContractTVL = await computeTVL(LPbalances, 'now', false, [], getCoingeckoLock, 5) ;

  const gauge_relative_weight_data = await gauge_relative_weight('ethereum');

  console.log(gauge_relative_weight_data);

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=insuredao%2Cethereum&vs_currencies=usd'
  );

  const inflationRate = await getRate('ethereum'); 

  pools.push(
    await getPoolUniLp(
      'ethereum',
      uniContractTVL.usdTvl,
      InflationTrackerAddress,
      gauge_relative_weight_data,
      inflationRate,
      priceData
    )
  );

  return pools;
};
//   pChain,
//   pTvl,
//   pInflationTrackerAddress,
//   pGauge_relative_weight,
//   pInflationRate,
//   pPriceData

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://www.insuredao.fi/',
};
