const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');

const { sumTokens, sumTokensAndLPs, unwrapCrv, unwrapUniswapLPs, genericUnwrapCvx, } = require('../../helper/unwrapLPs');


const insureTokenContract = '0xd83AE04c9eD29d6D3E6Bf720C71bc7BeB424393E';
const gageAddress = '0xf57882cf186db61691873d33e3511a40c3c7e4da';
const uni = "0x1b459aec393d604ae6468ae3f7d7422efa2af1ca";
const uniStaking = "0xf57882cf186db61691873d33e3511a40c3c7e4da";


const arbitrumGmxAddress = '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a';
const arbitrumGlpManagerAddress = '0x321F653eED006AD1C29D174e17d96351BDe22649';
const arbitrumFeeGmxTrackerAddress =
  '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
const arbitrumInflationGmxTrackerAddress =
  '0x908C4D94D34924765f1eDc22A1DD098397c59dD4';
const arbitrumFeeGlpTrackerAddress =
  '0x4e971a87900b931fF39d1Aad67697F49835400b6';
const arbitrumInflationGlpTrackerAddress =
  '0x1aDDD80E6039594eE970E5872D247bf0414C8903';

const avalacheGmxAddress = '0x62edc0692BD897D2295872a9FFCac5425011c661';
const avalancheGlpManagerAddress = '0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F';
const avalancheFeeGmxTrackerAddress =
  '0x4d268a7d4C16ceB5a606c173Bd974984343fea13';
const avalancheInflationGmxTrackerAddress =
  '0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342';
const avalancheFeeGlpTrackerAddress =
  '0xd2D1162512F927a7e282Ef43a362659E4F2a728F';
const avalancheInflationGlpTrackerAddress =
  '0x9e295B5B976a184B14aD8cd72413aD846C299660';

// async function pool2(timestamp, block) {
//   const balances = {}
//   await unwrapUniswapLPs(
//     uni, uniStaking, true]
//   , block)
//   return balances
// }

const secondsPerYear = 31536000;

async function getAdjustedAmount(pTarget, pChain, pAbi, pParams = []) {
  let decimals = await sdk.api.abi.call({
    target: pTarget,
    abi: 'erc20:decimals',
    chain: pChain,
  });
  let supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval']
    ? supply.output * 10 ** -decimals.output * secondsPerYear
    : supply.output * 10 ** -decimals.output;
}

async function getGlpTvl(pChain) {
  let tvl = await sdk.api.abi.call({
    target:
      pChain == 'arbitrum'
        ? arbitrumGlpManagerAddress
        : avalancheGlpManagerAddress,
    abi: abi['getAumInUsdg'],
    chain: pChain,
    params: [false],
  });
  // console.log(tvl.output)

  return tvl.output * 10 ** -18;
}

async function getRate(Chain) {
  let tvltemp = await sdk.api.abi.call({
    target: insureTokenContract,
    abi: abi['rate'],
    chain: Chain,
    params: [],
  });
  
  return tvltemp.output * 10 ** -18;
}


// console.log(test);

async function getPoolGlp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pGauge_relative_weight,
  pInflationRate,
  pPriceData
) {
  console.log(pInflationRate);
  // let gauge_relative_rate = 398309914581291888 / 1e18
  const yearlyInflationRate = pInflationRate * secondsPerYear * pGauge_relative_weight
  // pTvl = 124870
  const yearlyInflationInsure = yearlyInflationRate  * pPriceData.insuredao.usd;
  console.log(yearlyInflationInsure); //465359.52557910985
  // const yearlyInflationGlp = pInflationGlp  * pPriceData.gmx.usd;
  const apyInflation = (yearlyInflationInsure / pTvl) * 100;

  const chainString = 'Ethereum';

  pInflationTrackerAddress = '0xf57882cf186db61691873d33e3511a40c3c7e4da';

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'insuredao',
    symbol: utils.formatSymbol('INSURE-ETH'),
    tvlUsd: parseFloat(pTvl),
    apy: apyInflation,
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

  

  // console.log(await gauge_relative_weight('ethereum'));
  const gauge_relative_weight_data = await gauge_relative_weight('ethereum');

  console.log(gauge_relative_weight_data);
 

  sdk.util.sumSingleBalance(balances, insureTokenContract, 10000 * 1e18);
  sdk.util.sumSingleBalance(balances, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 10000 * 1e18);

  // const contractTVL = (await computeTVL(balances, 'now', false, [], getCoingeckoLock, 5)) ;

  // console.log(contractTVL.usdTvl);

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=insuredao%2Cethereum%2Cavalanche-2&vs_currencies=usd'
  );

  const arbitrumStakedGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumStakedEsGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'arbitrum',
    'erc20:totalSupply'
  );
  const arbitrumFeeGmx = await getAdjustedAmount(
    arbitrumFeeGmxTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  const arbitrumInflationGmx = await getAdjustedAmount(
    arbitrumInflationGmxTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );
  // pools.push(
  //   await getPoolGmx(
  //     'arbitrum',
  //     arbitrumInflationGmxTrackerAddress,
  //     arbitrumStakedGmx,
  //     arbitrumStakedEsGmx,
  //     arbitrumFeeGmx,
  //     arbitrumInflationGmx,
  //     priceData
  //   )
  // );

  const arbitrumFeeGlp = await getAdjustedAmount(
    arbitrumFeeGlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );

  const arbitrumInflationGlp = await getAdjustedAmount(
    arbitrumInflationGlpTrackerAddress,
    'arbitrum',
    abi['tokensPerInterval']
  );

  const inflationRate = await getRate('ethereum'); 

  pools.push(
    await getPoolGlp(
      'ethereum',
      uniContractTVL.usdTvl,      // await getGlpTvl('arbitrum') get Univ2 TVL
      arbitrumInflationGlpTrackerAddress,
      gauge_relative_weight_data,
      inflationRate,  // 0.88  ok
      priceData  //0.04172626  ok
    )
  );


  // pChain,
  // pTvl,
  // pInflationTrackerAddress,
  // pFeeGlp,
  // pInflationGlp,
  // pPriceData

  // const avalancheStakedGmx = await getAdjustedAmount(
  //   avalancheFeeGmxTrackerAddress,
  //   'avax',
  //   'erc20:totalSupply'
  // );
  // const avalancheStakedEsGmx = await getAdjustedAmount(
  //   avalancheInflationGmxTrackerAddress,
  //   'avax',
  //   'erc20:totalSupply'
  // );
  // const avalancheFeeGmx = await getAdjustedAmount(
  //   avalancheFeeGmxTrackerAddress,
  //   'avax',
  //   abi['tokensPerInterval']
  // );
  // const avalancheInflationGmx = await getAdjustedAmount(
  //   avalancheInflationGmxTrackerAddress,
  //   'avax',
  //   abi['tokensPerInterval']
  // );
  // console.log(avalancheInflationGmx);
  // pools.push(
  //   await getPoolGmx(
  //     'avax',
  //     avalancheInflationGmxTrackerAddress,
  //     avalancheStakedGmx,
  //     avalancheStakedEsGmx,
  //     avalancheFeeGmx,
  //     avalancheInflationGmx,
  //     priceData
  //   )
  // );

  

  // const avalancheFeeGlp = await getAdjustedAmount(
  //   avalancheFeeGlpTrackerAddress,
  //   'avax',
  //   abi['tokensPerInterval']
  // );
  // const avalancheInflationGlp = await getAdjustedAmount(
  //   avalancheInflationGlpTrackerAddress,
  //   'avax',
  //   abi['tokensPerInterval']
  // );
  // pools.push(
  //   await getPoolGlp(
  //     'avax',
  //     await getGlpTvl('avax'),
  //     avalancheInflationGlpTrackerAddress,
  //     avalancheFeeGlp,
  //     avalancheInflationGlp,
  //     priceData
  //   )
  // );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
};
