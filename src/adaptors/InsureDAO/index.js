const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { sumTokens, sumTokensAndLPs, unwrapCrv, unwrapUniswapLPs, genericUnwrapCvx, } = require('../../helper/unwrapLPs');


const InsuretokenContract = '0xd83AE04c9eD29d6D3E6Bf720C71bc7BeB424393E';

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

const uni = "0x1b459aec393d604ae6468ae3f7d7422efa2af1ca";
const uniStaking = "0xf57882cf186db61691873d33e3511a40c3c7e4da";

// async function pool2(timestamp, block) {
//   const balances = {}
//   await unwrapUniswapLPs(
//     uni, uniStaking, true]
//   , block)
//   return balances
// }

async function getRate(timestamp, block) {
  let balances = {};

  const vusdcBalances = (
    await sdk.api.abi.call({
      target: InsuretokenContract,
      abi: abi["rate"],
      chain: chain,
      block: block,
    })
  ).output;
  sdk.util.sumSingleBalance(balances, usdc, vusdcBalances);
  
  return vusdcBalance.output;
}

// console.log(getRate);




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




// async function getPoolGmx(
//   pChain,
//   pInflationTrackerAddress,
//   pStakedGmx,
//   pStakedEsGmx,
//   pFeeGmx,
//   pInflationGmx,
//   pPriceData
// ) {
//   const tvlGmx =
//     pPriceData.gmx.usd *
//     (await getAdjustedAmount(
//       pChain == 'arbitrum' ? arbitrumGmxAddress : avalacheGmxAddress,
//       pChain,
//       'erc20:balanceOf',
//       pChain == 'arbitrum'
//         ? [arbitrumInflationGmxTrackerAddress]
//         : [avalancheInflationGmxTrackerAddress]
//     ));
//   const tvsGmx = pStakedGmx * pPriceData.gmx.usd;
//   const tvsEsGmx = pStakedEsGmx * pPriceData.gmx.usd;
//   const yearlyFeeGmx =
//     pChain == 'arbitrum'
//       ? pFeeGmx * pPriceData.ethereum.usd
//       : pFeeGmx * pPriceData['avalanche-2'].usd;
//   const yearlyInflationGmx = pInflationGmx * pPriceData.gmx.usd;
//   const apyFee = (yearlyFeeGmx / tvsGmx) * 100;
//   const apyInflation = (yearlyInflationGmx / tvsEsGmx) * 100;
//   const chainString = pChain === 'avax' ? 'avalanche' : pChain;

//   return {
//     pool: pInflationTrackerAddress,
//     chain: utils.formatChain(chainString),
//     project: 'gmx',
//     symbol: utils.formatSymbol('GMX'),
//     tvlUsd: tvlGmx,
//     apy: apyFee + apyInflation,
//   };
// }

async function getPoolGlp(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pFeeGlp,
  pInflationGlp,
  pPriceData
) {
  const yearlyFeeGlp =
    pChain == 'arbitrum'
      ? pFeeGlp * pPriceData.ethereum.usd
      : pFeeGlp * pPriceData['avalanche-2'].usd;
  let gauge_relative_rate = 398309914581291888 / 1e18
  pInflationGlp = 0.88787417554 * secondsPerYear * gauge_relative_rate
                  //0.88787417554*31536000*(398309914581291888 / 1e18)*0.04112945
  pTvl = 126040
  const yearlyInflationGlp = pInflationGlp  * 0.04172626;
  // const yearlyInflationGlp = pInflationGlp  * pPriceData.gmx.usd;
  // const apyFee = (yearlyFeeGlp / pTvl) * 100;
  const apyInflation = (yearlyInflationGlp / pTvl) * 100;

  const chainString = 'Ethereum';
  // const chainString = pChain === 'avax' ? 'avalanche' : pChain;

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

const getPools = async () => {
  let pools = [];

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=gmx%2Cethereum%2Cavalanche-2&vs_currencies=usd'
    // 'https://api.coingecko.com/api/v3/simple/price?ids=insuredao%2Cethereum%2Cavalanche-2&vs_currencies=usd'
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




  pools.push(
    await getPoolGlp(
      'arbitrum',
      await getGlpTvl('arbitrum'),
      arbitrumInflationGlpTrackerAddress,
      arbitrumFeeGlp,
      arbitrumInflationGlp,  // 0.88
      priceData  //0.04172626
    )
  );

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
