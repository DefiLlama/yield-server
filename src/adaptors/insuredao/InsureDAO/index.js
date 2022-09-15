const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');

const { sumTokens, sumTokensAndLPs, unwrapCrv, unwrapUniswapLPs, genericUnwrapCvx, } = require('../../helper/unwrapLPs');


const insureTokenContract = '0xd83AE04c9eD29d6D3E6Bf720C71bc7BeB424393E';
const gaugeController = "0x297ea2afcE594149Cd31a9b11AdBAe82fa1Ddd04";

const uni = "0x1b459aec393d604ae6468ae3f7d7422efa2af1ca";
const uniStaking = "0xf57882cf186db61691873d33e3511a40c3c7e4da";
const gageAddressUniLP = '0xf57882cf186db61691873d33e3511a40c3c7e4da';

const vlINSURE = "0xA12ab76a82D118e33682AcB242180B4cc0d19E29";
const gageAddressVlINSURE = "0xbCBCf05F2f77E2c223334368162D88f5d6032699";

const secondsPerYear = 31536000;

//get InflationRate of INSURE token

async function getRate(Chain) {
  let tvltemp = await sdk.api.abi.call({
    target: insureTokenContract,
    abi: abi['rate'],
    chain: Chain,
    params: [],
  });
  
  return tvltemp.output * 10 ** -18;
}

//get gauge_relative_weight

async function gauge_relative_weight(gaugeAddess) {
  let gauge_relative_weight_value = await sdk.api.abi.call({
    target: gaugeController,
    abi: abi['gauge_relative_weight'],
    chain: 'ethereum',
    params: [gaugeAddess,0],
  });
  
  return gauge_relative_weight_value.output * 10 ** -18;;
}

// get Uniswap v2 LP Staking TVL

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

//calculate to Uni v2 Staking APY

async function getPoolUniLp(
  pChain,
  pTvl,
  pPoolContract,
  pGauge_relative_weight,
  pInflationRate,
  pPriceData
) {
  
  const yearlyInflationRate = pInflationRate * secondsPerYear * pGauge_relative_weight
  
  const yearlyInflationInsure = yearlyInflationRate  * pPriceData.insuredao.usd;

  const apyInflation = parseFloat(BigNumber(yearlyInflationInsure).div(pTvl).times(100));

  const chainString = 'Ethereum';

  return {
    pool: pPoolContract,
    chain: utils.formatChain(chainString),
    project: 'insuredao',
    symbol: utils.formatSymbol('INSURE-ETH'),
    tvlUsd: parseFloat(pTvl),
    apyReward: apyInflation,
    rewardTokens: [insureTokenContract],
    underlyingTokens: [uni],
  };
}

//calculate to vlINSURE Staking APY

async function getVlInsurePoolLp(
  pChain,
  pTvl,
  pPoolContract,
  pGauge_relative_weight,
  pInflationRate,
  pPriceData
) {  
  const yearlyInflationRate = pInflationRate * secondsPerYear * pGauge_relative_weight
  
  const yearlyInflationInsure = yearlyInflationRate  * pPriceData.insuredao.usd;
  
  const apyInflation = (yearlyInflationInsure / pTvl) * 100;

  const chainString = 'Ethereum';

  return {
    pool: pPoolContract,
    chain: utils.formatChain(chainString),
    project: 'insuredao',
    symbol: utils.formatSymbol('vlINSURE'),
    tvlUsd: parseFloat(pTvl),
    apyReward: apyInflation,
    rewardTokens: [insureTokenContract],
    underlyingTokens: [insureTokenContract],
  };
}


const getPools = async () => {
  let pools = [];

  const balances = {};

  const LPbalances =await pool2();
  
  const uniContractTVL = await computeTVL(LPbalances, 'now', false, [], getCoingeckoLock, 5) ;

  const gauge_relative_weight_data = await gauge_relative_weight(gageAddressUniLP);

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=insuredao%2Cethereum&vs_currencies=usd'
  );

  const inflationRate = await getRate('ethereum'); 

  pools.push(
    await getPoolUniLp(
      'ethereum',
      uniContractTVL.usdTvl,
      gageAddressUniLP,
      gauge_relative_weight_data,
      inflationRate,
      priceData
    )
  );

  const vlinsureTVL = (
    await sdk.api.abi.call({
      target: insureTokenContract,
      params: vlINSURE,
      abi: abi["balanceOf"],
      chain: 'ethereum',
    })
  ).output * 10 ** -18 * priceData.insuredao.usd;

  const gauge_relative_weight_data_vlinsure = await gauge_relative_weight(gageAddressVlINSURE);

  pools.push(
    await getVlInsurePoolLp(
      'ethereum',
      vlinsureTVL,
      vlINSURE,
      gauge_relative_weight_data_vlinsure,
      inflationRate,
      priceData
    )
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://www.insuredao.fi/',
};
