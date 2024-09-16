// const sdk = require('@defillama/sdk');
// const superagent = require('superagent');
// const { default: BigNumber } = require('bignumber.js');
// const utils = require('../utils');
// const abi = require('./abis/abi.json');
// const { request, gql } = require('graphql-request');
// const dayjs = require('dayjs');
// const { default: computeTVL } = require('@defillama/sdk/build/computeTVL');
// const {
//   sumTokens,
//   sumTokensAndLPs,
//   unwrapCrv,
//   genericUnwrapCvx,
// } = require('../../helper/unwrapLPs');

// const insureTokenContract = '0xd83AE04c9eD29d6D3E6Bf720C71bc7BeB424393E';
// const usdcTokenContract = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
// const gaugeController = '0x297ea2afcE594149Cd31a9b11AdBAe82fa1Ddd04';

// const uni = '0x1b459aec393d604ae6468ae3f7d7422efa2af1ca';
// const uniStaking = '0xf57882cf186db61691873d33e3511a40c3c7e4da';
// const gageAddressUniLP = '0xf57882cf186db61691873d33e3511a40c3c7e4da';

// const vlINSURE = '0xA12ab76a82D118e33682AcB242180B4cc0d19E29';
// const gageAddressVlINSURE = '0xbCBCf05F2f77E2c223334368162D88f5d6032699';

// const secondsPerYear = 31536000;
// const startPrice = 1000000;
// // From Feb-22-2022 02:22:22 UTC  Release date
// const yeildStartETH = 1645496542;
// // From Jul-08-2022 08:07:42
// const yeildStartASTAR = 1657264062;
// // From Aug-05-2022 08:03:34 UTC
// const yeildStartOP = 1659683014;
// // From Nov-14-2022 18:30:00 UTC
// const yeildStartARB = 1668450600;

// const data = [
//   {
//     chain: 'ethereum',
//     underlyingTokensContract: '0xDAea5b1B6b12Ac4c4f51aB12649e96ab3aB98C3A',
//     rewardTokensContract: '0x1daa36ce317b704b2a26c02af90a02aa572dc49a',
//     symbol: 'USDC',
//     poolMeta: 'Genesis Index',
//   },
//   {
//     chain: 'ethereum',
//     underlyingTokensContract: '0xd5f1Ab3c61eF3a6a6f1AA6141256Aa008D2fb5A1',
//     rewardTokensContract: '0x43Eb5Dc8A1426dCD6029010aDEe7B62b73AC2918',
//     symbol: 'USDC',
//     poolMeta: 'Curve Wars Index',
//   },
//   {
//     chain: 'ethereum',
//     underlyingTokensContract: '0x7E08daB409Ad1bCeBc5bE5674CB2C0f3540A4d3d',
//     rewardTokensContract: '0x1a047380b29fd8f6bfc8363f653114b15129c708',
//     symbol: 'USDC',
//     poolMeta: 'Quanstamp Index',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x9789dc4B4bb39566592B3761be42A9eB23EA5d34',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Starlay Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x4C1800E02532ed0fC60183454B9bffdf96B134F0',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Arthswap',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x37D65A2f66d022b3F1739dEDcA1DfA076526D53E',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Algem',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xD7Bd4cCBA0e500e1506b4B5783339b62e4d44F7f',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'AstridDAO',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x4C83C55cDAecd197CB2Ef04AFb2964e4403819a0',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Muuu Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xF89A343Eeb7F5c82b5B1C8469899F8b8018c2956',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'SiO2 Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xE3F491c575e02902342ef8488Bb3D6C392869FdA',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Zenlink',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xd2b848a364Df5410CE2161F9FD033Da42BaF7b78',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Avault Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xB6D53534CABF9cD65F51A9E1FC0d0bE1d9Bfd303',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Kagla Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0xb4Bcb8a8E8C4760Dd26A95C9cdA302afCa9063a8',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'AstarFarm',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x36CE8dB174e14A673fd31cD46CF8Dc1CE430AFFf',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Sirius Finance',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x96f88002c1b1342DA65D3D19c214cA398D3ECd7f',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Astar Core-A Index',
//   },
//   {
//     chain: 'astar',
//     underlyingTokensContract: '0x9d5AD4016BB6b70fd2b2228471664a8cB5b97125',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Astar Core-B Index',
//   },
//   {
//     chain: 'optimism',
//     underlyingTokensContract: '0x9AC5895302662abF7C88f1A9289f629c21634aDf',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Optimism Core-A Index',
//   },
//   {
//     chain: 'optimism',
//     underlyingTokensContract: '0x6D702e9eF07d0E5Ae32f5C4Bb53EdCf7BC61974F',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Optimism Core-B Index',
//   },
//   {
//     chain: 'optimism',
//     underlyingTokensContract: '0xF3037Fa2185776601196bC10E88448a9518b848F',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Optimism Core-C Index',
//   },
//   {
//     chain: 'optimism',
//     underlyingTokensContract: '0x5c9618F2DcC50B349d61F5F00B0371E94f203e29',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Optimism Core-D Index',
//   },
//   {
//     chain: 'arbitrum',
//     underlyingTokensContract: '0xCA570cb02dCaB8C89f47e52E0d083ad481728283',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Arbitrum Core-A Index',
//   },
//   {
//     chain: 'arbitrum',
//     underlyingTokensContract: '0x49f97e64b5eae37558976eb7a5bb1d7fba7b4cdb',
//     rewardTokensContract: null,
//     symbol: 'USDC',
//     poolMeta: 'Arbitrum Core-B Index',
//   },
// ];

// //get InflationRate of INSURE token

// async function getRate(Chain) {
//   let tvltemp = await sdk.api.abi.call({
//     target: insureTokenContract,
//     abi: abi['rate'],
//     chain: Chain,
//     params: [],
//   });

//   return tvltemp.output * 10 ** -18;
// }

// //get gauge_relative_weight

// async function gauge_relative_weight(gaugeAddess) {
//   let gauge_relative_weight_value = await sdk.api.abi.call({
//     target: gaugeController,
//     abi: abi['gauge_relative_weight'],
//     chain: 'ethereum',
//     params: [gaugeAddess, 0],
//   });

//   return gauge_relative_weight_value.output * 10 ** -18;
// }

// // get Uniswap v2 LP Staking TVL

// async function pool2(timestamp, block) {
//   const balances = {};
//   await sumTokensAndLPs(balances, [[uni, uniStaking, true]], block);
//   return balances;
// }

// function getCoingeckoLock() {
//   return new Promise((resolve) => {
//     locks.push(resolve);
//   });
// }

// // get pools liquidity

// async function get_pools_liquidity(_underlyingTokensContract, _chainString) {
//   let pools_liquidity = await sdk.api.abi.call({
//     target: _underlyingTokensContract,
//     abi: abi['totalLiquidity'],
//     chain: _chainString,
//   });
//   return pools_liquidity.output * 10 ** -6;
// }

// //get Get the exchange rate of LP tokens against underlying asset(scaled by MAGIC_SCALE_1E6)

// async function get_pricePerToken(_underlyingTokensContract, _chainString) {
//   let pricePerToken = await sdk.api.abi.call({
//     target: _underlyingTokensContract,
//     abi: abi['exchangeRateOfLP'],
//     chain: _chainString,
//   });

//   return pricePerToken.output;
// }

// //calculate to Uni v2 Staking APY

// async function getPoolUniLp(
//   pChain,
//   pTvl,
//   pPoolContract,
//   pGauge_relative_weight,
//   pInflationRate,
//   pPriceData
// ) {
//   const yearlyInflationRate =
//     pInflationRate * secondsPerYear * pGauge_relative_weight;

//   const yearlyInflationInsure =
//     yearlyInflationRate * pPriceData['coingecko:insuredao']?.price;

//   const apyInflation = parseFloat(
//     BigNumber(yearlyInflationInsure).div(pTvl).times(100)
//   );

//   const chainString = 'ethereum';

//   return {
//     pool: pPoolContract,
//     chain: utils.formatChain(chainString),
//     project: 'insuredao',
//     symbol: utils.formatSymbol('INSURE-ETH'),
//     tvlUsd: parseFloat(pTvl),
//     apyReward: apyInflation,
//     rewardTokens: [insureTokenContract],
//     underlyingTokens: [uni],
//   };
// }

// //calculate to vlINSURE Staking APY

// async function getVlInsurePoolLp(
//   pChain,
//   pTvl,
//   pPoolContract,
//   pGauge_relative_weight,
//   pInflationRate,
//   pPriceData
// ) {
//   const yearlyInflationRate =
//     pInflationRate * secondsPerYear * pGauge_relative_weight;

//   const yearlyInflationInsure =
//     yearlyInflationRate * pPriceData['coingecko:insuredao']?.price;

//   const apyInflation = (yearlyInflationInsure / pTvl) * 100;

//   const chainString = 'Ethereum';

//   return {
//     pool: pPoolContract,
//     chain: utils.formatChain(chainString),
//     project: 'insuredao',
//     symbol: utils.formatSymbol('vlINSURE'),
//     tvlUsd: parseFloat(pTvl),
//     apyReward: apyInflation,
//     rewardTokens: [insureTokenContract],
//     underlyingTokens: [insureTokenContract],
//   };
// }

// //calculate to USDC underwriting APY

// async function getUnderwritingAPY(
//   _poolContract,
//   _underlyingTokensContract,
//   _symbol,
//   _poolMeta,
//   _chainString,
//   _tvl,
//   _pricePerToken,
//   _startPrice,
//   _yieldStart
// ) {
//   const pricePerToken = new BigNumber(_pricePerToken);
//   const startPrice = new BigNumber(_startPrice);
//   const increasePrice = pricePerToken.minus(startPrice);
//   const span = new BigNumber(dayjs().unix())
//     .minus(new BigNumber(_yieldStart))
//     .div(24 * 60 * 60);

//   const apr = parseFloat(
//     increasePrice.div(startPrice).div(span).times(365).times(100)
//   );

//   return {
//     pool: _poolContract,
//     chain: utils.formatChain(_chainString),
//     project: 'insuredao',
//     symbol: utils.formatSymbol(_symbol),
//     poolMeta: _poolMeta,
//     tvlUsd: parseFloat(_tvl),
//     apyBase: apr,
//     // apyReward: apr,
//     rewardTokens: [usdcTokenContract],
//     underlyingTokens: [_underlyingTokensContract],
//   };
// }

// const getPools = async () => {
//   let pools = [];

//   const balances = {};

//   const priceKeys = ['insuredao', 'ethereum']
//     .map((t) => `coingecko:${t}`)
//     .join(',');

//   const [gauge_relative_weight_data, priceData, inflationRate] =
//     await Promise.all([
//       gauge_relative_weight(gageAddressUniLP),
//       utils.getData(`https://coins.llama.fi/prices/current/${priceKeys}`),
//       getRate('ethereum'),
//     ]);

//   const LPbalances = await pool2();

//   const uniContractTVL = await computeTVL(
//     LPbalances,
//     'now',
//     false,
//     [],
//     getCoingeckoLock,
//     5
//   );

//   pools.push(
//     await getPoolUniLp(
//       'ethereum',
//       uniContractTVL.usdTvl,
//       gageAddressUniLP,
//       gauge_relative_weight_data,
//       inflationRate,
//       priceData.coins
//     )
//   );

//   const vlinsureTVL =
//     (
//       await sdk.api.abi.call({
//         target: insureTokenContract,
//         params: vlINSURE,
//         abi: abi['balanceOf'],
//         chain: 'ethereum',
//       })
//     ).output *
//     10 ** -18 *
//     priceData.coins['coingecko:insuredao']?.price;

//   const gauge_relative_weight_data_vlinsure = await gauge_relative_weight(
//     gageAddressVlINSURE
//   );

//   pools.push(
//     await getVlInsurePoolLp(
//       'ethereum',
//       vlinsureTVL,
//       vlINSURE,
//       gauge_relative_weight_data_vlinsure,
//       inflationRate,
//       priceData.coins
//     )
//   );

//   //USDC underwriting Pool APY

//   for (var i = 0; i < data.length; i++) {
//     underlyingTokensContract = data[i].underlyingTokensContract;
//     symbol = data[i].symbol;
//     poolMeta = data[i].poolMeta;
//     chainString = data[i].chain;

//     if (data[i].stakingTokensContract == null) {
//       poolContract = data[i].underlyingTokensContract;
//     } else {
//       poolContract = data[i].stakingTokensContract;
//     }

//     if (chainString == 'ethereum') {
//       yeildStart = yeildStartETH;
//     } else if (chainString == 'optimism') {
//       yeildStart = yeildStartOP;
//     } else if (chainString == 'astar') {
//       yeildStart = yeildStartASTAR;
//     } else if (chainString == 'arbitrum') {
//       yeildStart = yeildStartARB;
//     } else {
//       null;
//     }

//     [tvl, pricePerToken] = await Promise.all([
//       get_pools_liquidity(underlyingTokensContract, chainString),
//       get_pricePerToken(underlyingTokensContract, chainString),
//     ]);

//     pools.push(
//       await getUnderwritingAPY(
//         poolContract,
//         underlyingTokensContract,
//         symbol,
//         poolMeta,
//         chainString,
//         tvl,
//         pricePerToken,
//         startPrice,
//         yeildStart
//       )
//     );
//   }

//   return pools.filter((p) => utils.keepFinite(p));
// };

// module.exports = {
//   timetravel: false,
//   apy: getPools,
//   url: 'https://www.insuredao.fi/',
// };
