/* 
  Saucerswap Reward Calculations: 
  
  1. To Calculate Lp Fee (apyBase)
  Reference https://docs.saucerswap.finance/features/liquidity
  Fee Share = 24 Volume (5-day avg) * 0.25 / 100
  Yearly Fees = Fee Share *365
  LP Fee = Yearly Fees / Liquidity (5-day avg) * 100
  Rewards are put back into the LP.

  2. To Calculate Reward for Providing LP (apyReward)
  Reference https://docs.saucerswap.finance/features/farm
  Rewarded in SAUCE and HBAR tokens
  Farm APR = (Weight * (Emission (SAUCE) * Price in USD (SAUCE) + (Emission (HBAR) * Price in USD (HBAR)) / Staked LP in USD * annualized 
  API (Farms) provide Emissions in per minute so annualized would be = 60*24*365
  Also farms api's emission fields already incorporate the weight of the farming incentives.
  If one of the tokens in the LP is HBARX, add partner apy from stader's (apy / 2) since it is a 50/50 LP.
*/
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const protocolSlug = 'saucerswap';
const baseUrl = 'https://api.saucerswap.finance/';
const staderUrl =
  'https://server.saucerswap.finance/api/v1/partners/stader/stats';
const apis = {
  farms: `${baseUrl}/farms`,
  pools: `${baseUrl}/pools`,
  fiveDAvg: `${baseUrl}pools/5day-avg`,
  stader: staderUrl,
};
const chain = 'hedera';
const minutesAnnualized = BigNumber(60 * 24 * 365);
const sauceTokenSymbol = 'SAUCE';
const hbarTokenSymbol = 'HBAR';
const hbarXTokenSymbol = 'HBARX';
const emissionTokens = [sauceTokenSymbol, hbarTokenSymbol, hbarXTokenSymbol];

const calculateTokenTVLUsd = (token, tokenReserve) => {
  const tokenDecimal = BigNumber(token.decimals);
  const bigTokenReserve = BigNumber(tokenReserve);
  const tokenPrice = BigNumber(token.priceUsd);
  if (tokenDecimal && tokenPrice) {
    return bigTokenReserve
      .div(BigNumber(10).pow(tokenDecimal))
      .times(tokenPrice);
  } else {
    return null;
  }
};

const main = async () => {
  const [farmData, poolsData, fiveDAvgData] = await Promise.all(
    ['farms', 'pools', 'fiveDAvg'].map((key) => utils.getData(apis[key]))
  );
  let emissionPriceUsd = {};
  // get emission tokens' id and price from pool data
  for (let i = 0; i < poolsData.length; i++) {
    const pool = poolsData[i];
    if (emissionTokens.length === 0) {
      break;
    }
    let tokenA = pool.tokenA;
    let tokenB = pool.tokenB;
    let indexOfA = emissionTokens.indexOf(tokenA.symbol);
    if (indexOfA >= 0) {
      emissionPriceUsd[tokenA.symbol] = {
        price: tokenA.priceUsd,
        id: tokenA.id,
      };
      emissionTokens.splice(indexOfA, 1);
    }
    let indexOfB = emissionTokens.indexOf(tokenB.symbol);
    if (indexOfB >= 0) {
      emissionPriceUsd[tokenB.symbol] = {
        price: tokenB.priceUsd,
        id: tokenB.id,
      };
      emissionTokens.splice(indexOfB, 1);
    }
  }
  let fiveDayVolLookup = {};
  let fiveDayPoolIds = Object.keys(fiveDAvgData);
  for (let i = 0; i < fiveDayPoolIds.length; i++) {
    const poolId = fiveDayPoolIds[i];
    const pool = fiveDAvgData[poolId];
    fiveDayVolLookup[poolId] = {
      volume: pool?.volume,
      liquidity: pool?.liquidity,
    };
  }
  let farmDataLookup = {};
  for (let i = 0; i < farmData.length; i++) {
    const pool = farmData[i];
    farmDataLookup[pool.poolId] = {
      id: pool.id,
      poolId: pool.poolId,
      sauceEmissions: pool.sauceEmissions,
      hbarEmissions: pool.hbarEmissions,
      staked: pool.staked,
    };
  }
  // hbarx pools get staderAPY / 2 since they are staked in one of the pairs.
  // const staderApy = BigNumber(staderData.apy);
  // const staderPoolApy = staderApy.div(BigNumber(2));
  let data = poolsData
    .map((pool) => {
      // skip if pool id doesn't exist or we don't have farm data
      if (pool.id === undefined || farmDataLookup[pool.id] === undefined) {
        return null;
      }
      const tokenA = pool.tokenA;
      const tokenB = pool.tokenB;
      const tokenReserveA = pool.tokenReserveA;
      const tokenReserveB = pool.tokenReserveB;
      const poolId = pool.id;
      const lpToken = pool.lpToken;
      const poolAddress = lpToken.id;
      const poolName = lpToken.name;
      const poolSymbol = lpToken.symbol;
      //lp fee apr
      const fiveDayVolume = fiveDayVolLookup[poolId];
      const volume = BigNumber(fiveDayVolume?.volume);
      const liquidity = BigNumber(fiveDayVolume?.liquidity);
      const feeShare = volume.times(BigNumber(0.25)).div(BigNumber(100));
      const yearlyFee = feeShare.times(BigNumber(365));
      const lpAwardApr = yearlyFee.div(liquidity).times(BigNumber(100)); // in percentage
      //farming apr
      const tokenATvlUsd = calculateTokenTVLUsd(tokenA, tokenReserveA);
      const tokenBTvlUsd = calculateTokenTVLUsd(tokenB, tokenReserveB);
      const lpTvlUsd = tokenATvlUsd.plus(tokenBTvlUsd);
      const lpReserve = BigNumber(pool.lpTokenReserve);
      const farmData = farmDataLookup[poolId];
      const farmingLpStaked = BigNumber(farmData.staked);
      const farmingStakedToTotalLpRatio = farmingLpStaked.div(lpReserve);
      const farmingStakedTvlUsd = farmingStakedToTotalLpRatio.times(lpTvlUsd);
      const emissionSauce = BigNumber(farmData.sauceEmissions);
      const emissionHbar = BigNumber(farmData.hbarEmissions);
      const totalEmissionSauceUsdPerYear = emissionSauce
        .times(emissionPriceUsd[sauceTokenSymbol].price)
        .times(minutesAnnualized);
      const totalEmissionHbarUsdPerYear = emissionHbar
        .times(emissionPriceUsd[hbarTokenSymbol].price)
        .times(minutesAnnualized);
      const totalEmissionUsd = totalEmissionSauceUsdPerYear.plus(
        totalEmissionHbarUsdPerYear
      );
      let baseFarmApr = totalEmissionUsd.div(farmingStakedTvlUsd).times(100); // in percentage
      // look up reward token ids;
      let rewardTokens = [
        emissionPriceUsd[sauceTokenSymbol].id,
        emissionPriceUsd[hbarTokenSymbol].id,
      ];
      // add stader apy if pool contains HBARX token
      if (
        tokenA.symbol === hbarXTokenSymbol ||
        tokenB.symbol === hbarXTokenSymbol
      ) {
        // baseFarmApr = baseFarmApr.plus(staderPoolApy);
        baseFarmApr = baseFarmApr;
      }
      return {
        pool: `${poolAddress}`,
        // poolMeta: `${poolName}`,
        chain: chain,
        project: protocolSlug,
        symbol: utils.formatSymbol(poolSymbol),
        tvlUsd: farmingStakedTvlUsd.toNumber(),
        apyBase: lpAwardApr.toNumber(),
        apyReward: baseFarmApr.toNumber(),
        rewardTokens: rewardTokens,
        underlyingTokens: [tokenA.id, tokenB.id],
      };
    })
    .filter((data) => data !== null);
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.saucerswap.finance/farm',
};
