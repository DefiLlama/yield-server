// /**
//  * interface Pool {
//   pool: string;
//   chain: string;
//   project: string;
//   symbol: string;
//   tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
//   apyBase?: number;
//   apyReward?: number;
//   rewardTokens?: Array<string>;
//   underlyingTokens?: Array<string>;
//   poolMeta?: string;
//   url?: string;
//   // optional lending protocol specific fields:
//   apyBaseBorrow?: number;
//   apyRewardBorrow?: number;
//   totalSupplyUsd?: number;
//   totalBorrowUsd?: number;
//   ltv?: number; // btw [0, 1]
// }
//  */

// const { ethers } = require('ethers/lib');
// const { protocolDataProviderAbi } = require('./abi');
// const {
//   getKsdEarn,
//   getStKlayApr,
//   getRecentPoolInfo,
//   getLeveragePoolInfo,
//   get4nutsApr,
// } = require('./externalData');
// const shoebillDataProviderAddress =
//   '0xBdc26Ba6a0ebFD83c76CEf76E8F9eeb7714A5884';

// const ethersProvider = new ethers.providers.JsonRpcProvider(
//   'https://klaytn.blockpi.network/v1/rpc/public'
// );

// const dataProvider = new ethers.Contract(
//   shoebillDataProviderAddress,
//   protocolDataProviderAbi,
//   ethersProvider
// );
// const SECONDS_PER_YEAR = 31536000;

// async function getExtenralYieldApr() {
//   const lpPool = await Promise.all([
//     getKsdEarn(),
//     get4nutsApr(),
//     getStKlayApr(),
//     getRecentPoolInfo(),
//   ]);
//   const singlePool = await getLeveragePoolInfo();

//   return { singlePool, lpPool };
// }
// async function poolsFunction() {
//   const aggregatedData = await dataProvider.getAllAggregatedReservesData();
//   const { lpPool, singlePool } = await getExtenralYieldApr();

//   let totalDepositedCollateral = 0;
//   let totalDepositedCollateralYieldApr = 0;
//   let totalDepositedLend = 0;
//   const data = aggregatedData.map((e) => {
//     let yieldApr =
//       (e.overview.isCollateral
//         ? lpPool?.find(
//             (t) =>
//               t?.underlyingAddress?.toLowerCase() ===
//               e.token.externalAddress?.toLowerCase()
//           )?.realizedApy
//         : singlePool?.find(
//             (t) =>
//               t?.underlyingAddress?.toLowerCase() ===
//               e.token.externalAddress?.toLowerCase()
//           )?.realizedApy) || 0;

//     const variableBorrowAPR = Number(e.overview.variableBorrowRate) / 1e27;
//     const variableBorrowAPY =
//       (1 + variableBorrowAPR / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;

//     const depositAPR = Number(e.overview.liquidityRate) / 1e27;
//     const depositAPY =
//       (1 + depositAPR / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;

//     const totalDeposit =
//       Number(e.overview.availableLiquidity.add(e.overview.totalVariableDebt)) /
//       10 ** e.configuration.decimals;
//     const totalBorrow =
//       Number(e.overview.totalVariableDebt) / 10 ** e.configuration.decimals;
//     const totalDepositInUSD = (totalDeposit * e.oraclePrice) / 1e8;
//     if (!e.overview.isCollateral) {
//       let beforeYieldApr = yieldApr;
//       yieldApr = (yieldApr * (totalDeposit - totalBorrow)) / totalDeposit;
//       if (isNaN(yieldApr)) yieldApr = beforeYieldApr;
//     }

//     let toLendApr = 0;
//     if (e.overview.isCollateral) {
//       let info = lpPool?.find(
//         (t) =>
//           t?.underlyingAddress?.toLowerCase() ===
//           e.token.externalAddress?.toLowerCase()
//       );
//       toLendApr = info?.totalRate * info?.incentiveFeeRate || 0;
//       totalDepositedCollateral += totalDepositInUSD;
//     } else {
//       totalDepositedLend += totalDepositInUSD;
//     }
//     return {
//       pool: `${e.token.externalAddress}-Klaytn`?.toLowerCase(),
//       chain: 'Klaytn',
//       project: 'shoebill-v1',
//       symbol: e.token.externalSymbol,
//       tvlUsd:
//         Number(e.overview.availableLiquidity.mul(e.oraclePrice)) /
//         10 ** e.configuration.decimals /
//         1e8,

//       totalSupplyUsd: totalDepositInUSD,
//       totalBorrowUsd:
//         Number(e.overview.totalVariableDebt.mul(e.oraclePrice)) /
//         10 ** e.configuration.decimals /
//         1e8,
//       ltv: 0,
//       //apyBase
//       apyBaseBorrow: variableBorrowAPY,

//       //
//       toLendApr,
//       isCollateral: e.overview.isCollateral,
//       yieldApr,
//       depositAPY: depositAPY,
//     };
//   });
//   let poolsData = data
//     .map((e) => {
//       if (e.isCollateral) {
//         totalDepositedCollateralYieldApr +=
//           (e.totalSupplyUsd / totalDepositedCollateral) * e.toLendApr;
//       }

//       return { ...e };
//     })
//     .map((t) => {
//       if (!t.isCollateral) {
//         let tmp = isNaN(totalDepositedCollateralYieldApr)
//           ? 0
//           : totalDepositedCollateralYieldApr;
//         t.yieldApr += (totalDepositedCollateral / totalDepositedLend) * tmp;
//       }
//       const yieldApy =
//         (1 + t.yieldApr / 100 / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
//       const depositApy = t.depositAPY;
//       delete t.depositAPY;
//       delete t.toLendApr;
//       delete t.isCollateral;
//       delete t.yieldApr;

//       return {
//         ...t,
//         apyBase: (depositApy + yieldApy) * 100,
//         apyBaseBorrow: t.apyBaseBorrow * 100,
//       };
//     });
//   return poolsData;
// }

// module.exports = {
//   timetravel: false,
//   apy: poolsFunction,
//   url: 'https://app.shoebill.finance/',
// };
