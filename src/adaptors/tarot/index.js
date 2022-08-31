/* 
  used g1nt0ki's code as a base from DefiLlama-Adapters ./projects/tarot/index.js
  General setup
  1. Loop through each factory in each chain under const config
  2. Get the lending pools which are the vaults that tarot lets you borrow/lend tokens with the liquidity pool of the tokens as collateral.
  2a. If only lending, you don't need to supply collateral (which gets counted as excess supply)
  3. Prefetch the prices of the tokens (looking at the token0 and token1 fields in the lendingPools) from https://coins.llama.fi/prices

  To calculate TVL
  1. For each lending pool follow the below for each borrowable tokens (underlying are token0 and token1)
  2. Get the reserves of the tokens from the lending pool contract. Use the respective token's reserve and get the USD amount.
    In USD term both tokens should be equal (or close) since they are a 50/50 weighted LP. (const lpTvlUsd)
  3. Get the excess supply of the borrowable token by getting the balanceOf the underlying token and get the USD amount (const excessSupplyUsd)
  4. Add the reserve in USD from step 2 and excess supply in USD in step 3 above to get the totalTvl for that token (const totalTvl)

  To calculate APY (for the supplied token)
  1. For each lending pool follow the below for each borrowable token (underlying are token0 and token1)
  2. Get the following values from the borrowable contract
  2a. reserveFactor
  2b. totalBorrows
  2c. borrowRate
  2d. decimals
  3. Calculate the total supply of the borrowable contract: totalBorrows + excessSupply. (const totalSupply)
  4. Calculate the utilization rate: totalBorrows/totalSupply. (const utilization)
  5. Calculate the supply rate with the formula below:
  (borrowRate *utilization*(10 ** borrowableDecimal - reserveFactor) * SECONDS_IN_YEAR) / (10 **borrowableDecimal * 10 ** borrowableDecimal);
  (const supplyRateAPY)

  Notes:
  1. There are some disabled tarot lending pools which are ignored (defined in const DISABLED_LENDING_POOLS. copy of the lending pool lists is in ./config/lending-pools.js)
  2. There are few tokens where prices were not available so they are skipped.
  3. There are some lending pools where the abis were not published yet so they are skipped.
*/
const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const SECONDS_IN_YEAR = BigNumber(365).times(24).times(3600);
const protocolSlug = 'tarot';
const sdk = require('@defillama/sdk');
const { getChainTransform } = require('../../helper/transform');
const { getProvider } = require('@defillama/sdk/build/general');
const config = {
  fantom: {
    factories: [
      '0x35C052bBf8338b06351782A565aa9AaD173432eA', // Tarot Classic
      '0xF6D943c8904195d0f69Ba03D97c0BAF5bbdCd01B', // Tarot Requiem
      '0xbF76F858b42bb9B196A87E43235C2f0058CF7322', // Tarot Carcosa
    ],
  },
  optimism: {
    factories: [
      '0x1D90fDAc4DD30c3ba38d53f52A884F6e75d0989e', // Tarot Opaline
      '0xD7cABeF2c1fD77a31c5ba97C724B82d3e25fC83C', // Tarot Velours
    ],
  },
};
// pools that are disabled by tarot.co (included in their lending-pool.ts)
const DISABLED_LENDING_POOLS = [
  '0x4601ad6ffd55f15dadc639b8704b19dc4b7dfc91',
  '0x6d368f3f94601cce3f9806381a6132feb0dd6272',
];

const transformTokenForApi = (chain, token, transform) => {
  const transformedToken = transform(token);
  if (transformedToken !== token && transformedToken.indexOf(':') < 0) {
    return `ethereum:${transformedToken}`;
  } else if (transformedToken.indexOf(':') > -1) {
    return `${transformedToken}`;
  } else {
    return `${chain}:${transform(token)}`;
  }
};

const getAllLendingPools = async (factory, chain, block) => {
  const { output: allLendingPoolsLength } = await sdk.api.abi.call({
    target: factory,
    abi: abi.allLendingPoolsLength,
    chain,
    block,
    requery: true,
  });
  // get all of the lending pools from the factory contract
  const poolCalls = [];
  for (let i = 0; i < +allLendingPoolsLength; i++)
    poolCalls.push({ params: i });
  const { output: lendingPoolsResults } = await sdk.api.abi.multiCall({
    target: factory,
    abi: abi.allLendingPools,
    calls: poolCalls,
    chain,
    block,
    requery: true,
  });
  const lendingPoolAddresses = lendingPoolsResults.map((i) => i.output);
  const lendingPoolAddressesParamsCalls = lendingPoolAddresses.map((i) => ({
    params: i,
  }));
  const lendingPoolAddressesTargetCalls = lendingPoolAddresses.map((i) => ({
    target: i,
  }));
  const { output: getLendingPools } = await sdk.api.abi.multiCall({
    target: factory,
    abi: abi.getLendingPool,
    calls: lendingPoolAddressesParamsCalls,
    chain,
    block,
    requery: true,
  });
  const lendingPoolsDetails = getLendingPools.map((i) => i.output);
  // get tokens 0 and 1 of all lending pools
  const { output: token0sResults } = await sdk.api.abi.multiCall({
    calls: lendingPoolAddressesTargetCalls,
    abi: abi.token0,
    chain,
    block,
    requery: true,
  });
  const token0s = token0sResults.map((i) => i.output);
  const { output: token1sResults } = await sdk.api.abi.multiCall({
    calls: lendingPoolAddressesTargetCalls,
    abi: abi.token1,
    chain,
    block,
    requery: true,
  });
  const token1s = token1sResults.map((i) => i.output);
  // get lending pool address decimals
  const { output: lendingPoolDecimalsResults } = await sdk.api.abi.multiCall({
    calls: lendingPoolAddressesTargetCalls,
    abi: abi.decimals,
    chain,
    block,
    requery: true,
  });
  const lendingPoolDecimals = lendingPoolDecimalsResults.map((i) => i.output);
  // get reserves
  const { output: getReservesResults } = await sdk.api.abi.multiCall({
    calls: lendingPoolAddressesTargetCalls,
    abi: abi.getReserves,
    chain,
    block,
  });
  const lendingPoolReserves = getReservesResults.map((i) => {
    if (!i.output || !i.output.reserve0 || !i.output.reserve1) {
      return null;
    } else {
      return [i.output.reserve0, i.output.reserve1];
    }
  });
  return {
    lendingPoolAddresses,
    lendingPoolAddressesParamsCalls,
    lendingPoolAddressesTargetCalls,
    lendingPoolsDetails,
    token0s,
    token1s,
    lendingPoolDecimals,
    lendingPoolReserves,
  };
};

const getUnderlyingLiquidityPoolAddresses = async (
  lendingPoolAddresses,
  lendingPoolAddressesTargetCalls,
  chain,
  block
) => {
  const { output: lendingPoolSymbolsResults } = await sdk.api.abi.multiCall({
    calls: lendingPoolAddressesTargetCalls,
    abi: abi.symbol,
    chain,
    block,
  });
  const lendingPoolSymbols = lendingPoolSymbolsResults.map((i) => i.output);
  // get underlying LP related info
  let slpLpAddressesCalls = [];
  let slpLpAddressesCallsIndex = [];
  for (let index = 0; index < lendingPoolAddresses.length; index++) {
    // slightly different logic for SLP and spLP lending pools where underlying liquidity pool is the same as the tarot's lending pool
    if (
      lendingPoolSymbols[index] === 'SLP' ||
      lendingPoolSymbols[index] === 'spLP'
    ) {
      slpLpAddressesCalls.push({ target: lendingPoolAddresses[index] });
      slpLpAddressesCallsIndex.push(index);
    }
  }
  const { output: underlyingLpAddressesResults } = await sdk.api.abi.multiCall({
    abi: abi.underlying,
    calls: lendingPoolAddressesTargetCalls,
    chain,
    block,
  });
  let underlyingLpAddresses = underlyingLpAddressesResults.map((i) => i.output);
  // for slp and spLP use same lendingpool as underlying
  if (slpLpAddressesCalls.length > 0) {
    for (let x = 0; x < slpLpAddressesCalls.length; x++) {
      underlyingLpAddresses[slpLpAddressesCallsIndex[x]] =
        lendingPoolAddresses[slpLpAddressesCallsIndex[x]];
    }
  }
  const underlyingLpAddressesTargetCalls = underlyingLpAddresses.map((i) => ({
    target: i,
  }));
  const { output: underlyingLiquidityPoolSymbolsResults } =
    await sdk.api.abi.multiCall({
      calls: underlyingLpAddressesTargetCalls,
      abi: abi.symbol,
      chain,
      block,
    });
  const underlyingLiquidityPoolSymbols =
    underlyingLiquidityPoolSymbolsResults.map((i) => i.output);
  return {
    lendingPoolSymbols,
    underlyingLpAddresses,
    underlyingLiquidityPoolSymbols,
  };
};

const removeDuplicatesFromArray = (arr) => {
  return [...new Set([].concat(...arr))];
};

// Liquidity Pool Names are sometimes the same (since they are forked or upgraded) so look up by the underlying factory contract to determine the name
const transformTarotLPName = async (
  underlyingLiquidityPoolSymbol,
  lendingPoolAddress,
  token0Symbol,
  token1Symbol,
  supplyTokenSymbol,
  chain,
  block
) => {
  let poolName;
  let poolId;
  // if symbols are matched below, use the factory to determine the pool name
  if (
    underlyingLiquidityPoolSymbol === 'spLP' ||
    underlyingLiquidityPoolSymbol === 'SPIRIT-LP' ||
    underlyingLiquidityPoolSymbol === 'TOMB-V2-LP' ||
    underlyingLiquidityPoolSymbol.indexOf('vAMM') > -1
  ) {
    const { output: lendingPoolFactory } = await sdk.api.abi.call({
      target: lendingPoolAddress,
      abi: abi.factory,
      chain,
      block,
      requery: true,
    });
    // if symbol is from solidex/0xDAO/Velodrome
    if (underlyingLiquidityPoolSymbol.indexOf('vAMM') !== -1) {
      switch (lendingPoolFactory.toLowerCase()) {
        // Solidex 0x17235bb61f7a8c3e93a8ad2b1b12802e00121c35
        case '0x17235bb61f7a8c3e93a8ad2b1b12802e00121c35':
          poolName = 'Solidex';
          break;
        // 0xDAO 0x1f8e600303a7c85166467b0e5921ab394dc5cdb7
        case '0x1f8e600303a7c85166467b0e5921ab394dc5cdb7':
          poolName = '0xDAO';
          break;
        // velodrome 0x19283dd283c31bf3920f7a530aa3a81a2792dc52
        case '0x19283dd283c31bf3920f7a530aa3a81a2792dc52':
          poolName = 'Velodrome';
          break;
      }
    } else {
      switch (underlyingLiquidityPoolSymbol) {
        case 'spLP':
          switch (lendingPoolFactory.toLowerCase()) {
            //spooky v2 0x10ea0977f832f851786cfdc2f29a9fc1b97b79b1
            case '0x701e3156c4e5abe044f756936792032bb96481b9':
              poolName = 'Spooky V2';
              break;
            //2omb 0x10ea0977f832f851786cfdc2f29a9fc1b97b79b1
            case '0x10ea0977f832f851786cfdc2f29a9fc1b97b79b1':
              poolName = '2omb';
              break;
            //3omb 0xd25005e7280420a60092f3963d6a1cb7543ce7df
            case '0xd25005e7280420a60092f3963d6a1cb7543ce7df':
              poolName = '3omb';
              break;
            default:
              poolName = 'Spooky';
              break;
          }
          break;
        case 'SPIRIT-LP':
          // differentiate boosted and non boosted spirit ppols
          // boosted pools have factory address of 0x9f28680ebaca6ef09c1db327f8d0f9b6fc498127
          switch (lendingPoolFactory.toLowerCase()) {
            case '0x9f28680ebaca6ef09c1db327f8d0f9b6fc498127':
              poolName = 'Spirit Boosted';
              break;
            default:
              poolName = 'Spirit';
              break;
          }
          break;
        case 'TOMB-V2-LP':
          switch (lendingPoolFactory.toLowerCase()) {
            // tomb cemetery 0x9189a6c06a33dea7ad82201e37b73fe2adc595ed
            case '0x9189a6c06a33dea7ad82201e37b73fe2adc595ed':
              poolName = 'Tomb Cemetery';
              break;
            // tomb cemetery v2 0x2dc3be114ec36ae0e8dc70f3090b8f2bcb7c18e7
            case '0x2dc3be114ec36ae0e8dc70f3090b8f2bcb7c18e7':
              poolName = 'Tomb Cemetery V2';
              break;
            // Based Agora 0xfcfcf2f7773a303fdd3eb003edf23e213a92547c or 0xe62745519c1d2af846387b8abd142a2d2583c275
            case '0xfcfcf2f7773a303fdd3eb003edf23e213a92547c':
            case '0xe62745519c1d2af846387b8abd142a2d2583c275':
              poolName = 'Based Agora';
              break;
          }
          break;
      }
    }
  } else {
    switch (underlyingLiquidityPoolSymbol) {
      case 'SLP':
        poolName = 'Sushi';
        break;
    }
  }
  // if pool name chnaged from conditions above
  if (poolName !== undefined) {
    poolId = `${poolName} ${token0Symbol}/${token1Symbol}-${supplyTokenSymbol}`;
  }
  return poolId;
};

// get prices function
const getPrices = async (coinKeys) => {
  let results = {};
  // fetch prices by 100
  if (coinKeys.length > 0) {
    for (let i = 0; i < coinKeys.length; i += 100) {
      const {
        data: { coins },
      } = await axios.post('https://coins.llama.fi/prices', {
        coins: coinKeys.slice(i, i + 100),
      });
      for (const key of Object.keys(coins)) {
        results[key] = coins[key];
      }
    }
  }
  return results;
};

const getTokenDetails = async (allUniqueTokens, chain, block) => {
  let results = {};
  const tokensCalls = allUniqueTokens.map((i) => ({ target: i }));
  const { output: getTokenDecimals } = await sdk.api.abi.multiCall({
    abi: abi.decimals,
    calls: tokensCalls,
    chain,
    block,
    requery: true,
  });
  // underlying tokens symbol just reference from bulk
  const { output: getTokenSymbols } = await sdk.api.abi.multiCall({
    abi: abi.symbol,
    calls: tokensCalls,
    chain,
    block,
    requery: true,
  });
  const tokensSymbols = getTokenSymbols.map((i) => i.output);

  for (let i = 0; i < getTokenDecimals.length; i++) {
    tokensDecimalResult = getTokenDecimals[i];
    tokenSymbolResult = getTokenSymbols[i];
    let key = tokensDecimalResult.input.target;
    results[key] = {
      decimals: tokensDecimalResult.output,
      symbol: tokenSymbolResult.output,
    };
  }
  return results;
};

const getUnderlyingTokenAndBorrowableDetails = async (
  underlyingTokenAddress,
  borrowableTokenAddress,
  chain,
  block,
  lendingPoolAddress
) => {
  const { output: excessSupply } = await sdk.api.erc20.balanceOf({
    target: underlyingTokenAddress,
    owner: borrowableTokenAddress,
    chain,
    block,
  });
  const { output: reserveFactor } = await sdk.api.abi.call({
    target: borrowableTokenAddress,
    abi: abi.reserveFactor,
    chain,
    block,
  });
  const { output: totalBorrows } = await sdk.api.abi.call({
    target: borrowableTokenAddress,
    abi: abi.totalBorrows,
    chain,
    block,
    requery: true,
  });
  const { output: borrowRate } = await sdk.api.abi.call({
    target: borrowableTokenAddress,
    abi: abi.borrowRate,
    chain,
    block,
    requery: true,
  });
  const { output: borrowableDecimal } = await sdk.api.abi.call({
    target: borrowableTokenAddress,
    abi: abi.decimals,
    chain,
    block,
    requery: true,
  });
  const totalSupply = BigNumber(totalBorrows).plus(BigNumber(excessSupply));
  return {
    excessSupply,
    reserveFactor,
    totalBorrows,
    borrowRate,
    borrowableDecimal,
    totalSupply,
  };
};
// calculate tvl function
const caculateTvl = (
  excessSupply,
  tokenDecimals,
  underlyingTokenPriceUsd,
  lpReserve
) => {
  const excessSupplyUsd = BigNumber(excessSupply)
    .div(BigNumber(10).pow(BigNumber(tokenDecimals)))
    .times(BigNumber(underlyingTokenPriceUsd));
  const lpTvlUsd = BigNumber(lpReserve)
    .div(BigNumber(10).pow(BigNumber(tokenDecimals)))
    .times(BigNumber(underlyingTokenPriceUsd));
  const totalTvl = excessSupplyUsd.plus(lpTvlUsd);
  return totalTvl;
};

// calculate apy function
const calculateApy = (
  borrowRate,
  borrowableDecimal,
  totalBorrows,
  totalSupply,
  reserveFactor
) => {
  const borrowRateAPY = BigNumber(borrowRate)
    .div(BigNumber(10).pow(BigNumber(borrowableDecimal)))
    .times(SECONDS_IN_YEAR);
  const utilization = BigNumber(totalBorrows).div(BigNumber(totalSupply));
  const supplyRateAPY = BigNumber(borrowRate)
    .times(BigNumber(utilization))
    .times(
      BigNumber(10)
        .pow(BigNumber(borrowableDecimal))
        .minus(BigNumber(reserveFactor))
    )
    .times(SECONDS_IN_YEAR)
    .div(
      BigNumber(10)
        .pow(BigNumber(borrowableDecimal))
        .times(BigNumber(10).pow(BigNumber(borrowableDecimal)))
    );
  return { borrowRateAPY, utilization, supplyRateAPY };
};
const main = async () => {
  let data = [];
  let ctr = 0;
  for (const chain of Object.keys(config)) {
    const { factories } = config[chain];
    const transform = await getChainTransform(chain);
    let collaterals = [];
    let borrowables = [];
    const provider = getProvider(chain);
    const block = await provider.getBlockNumber();
    for (const factory of factories) {
      const {
        lendingPoolAddresses,
        lendingPoolAddressesParamsCalls,
        lendingPoolAddressesTargetCalls,
        lendingPoolsDetails,
        token0s,
        token1s,
        lendingPoolDecimals,
        lendingPoolReserves,
      } = await getAllLendingPools(factory, chain, block);
      // get underlying LP related info
      const {
        lendingPoolSymbols,
        underlyingLpAddresses,
        underlyingLiquidityPoolSymbols,
      } = await getUnderlyingLiquidityPoolAddresses(
        lendingPoolAddresses,
        lendingPoolAddressesTargetCalls,
        chain,
        block
      );
      const allTokens = [...token0s, ...token1s];
      const allUniqueTokens = removeDuplicatesFromArray(allTokens);
      const coinKeys = allUniqueTokens.map((token) => {
        let transformedToken = transformTokenForApi(chain, token, transform);
        return transformedToken;
      });
      let fetchedPrices = await getPrices(coinKeys);
      // go to the next factory contract since no tokens were found here.
      if (Object.keys(fetchedPrices) === 0) {
        continue;
      }
      const tokenDetailsDict = await getTokenDetails(
        allUniqueTokens,
        chain,
        block
      );
      // loop through lending pool
      for (let i = 0; i < lendingPoolsDetails.length; i++) {
        let lendingPoolAddress = lendingPoolAddresses[i];
        // check if pool is disabled
        if (
          DISABLED_LENDING_POOLS.indexOf(lendingPoolAddress.toLowerCase()) !==
          -1
        ) {
          continue;
        }
        let lendingPool = lendingPoolsDetails[i];
        const underlyingLpAddress = underlyingLpAddresses[i];
        // get underlying (LP) of lending pool symbol
        const underlyingLiquidityPoolSymbol = underlyingLiquidityPoolSymbols[i];
        // check if the lending pool has a name
        if (underlyingLiquidityPoolSymbol === null) {
          continue;
        }
        let borrowables = [];
        borrowables.push(lendingPool.borrowable0);
        borrowables.push(lendingPool.borrowable1);
        let collateral = lendingPool.collateral;
        let tokens = [];
        tokens = [token0s[i], token1s[i]];
        const lendingPoolDecimal = lendingPoolDecimals[i];
        const reserves = lendingPoolReserves[i];
        // ignore lending pools with no reserves because you can not calculate the APY and TVL.
        if (reserves == null) {
          continue;
        }
        // loop through each borrowable tokens and push apy/tvl data
        for (let j = 0; j < borrowables.length; j++) {
          borrowableTokenAddress = borrowables[j];
          underlyingTokenAddress = tokens[j];
          tokenSymbol = tokenDetailsDict[underlyingTokenAddress].symbol;
          tokenDecimals = tokenDetailsDict[underlyingTokenAddress].decimals;
          lpReserve = reserves[j];
          const {
            excessSupply,
            reserveFactor,
            totalBorrows,
            borrowRate,
            borrowableDecimal,
            totalSupply,
          } = await getUnderlyingTokenAndBorrowableDetails(
            underlyingTokenAddress,
            borrowableTokenAddress,
            chain,
            block,
            lendingPoolAddress
          );
          //apy calculations
          const { borrowRateAPY, utilization, supplyRateAPY } = calculateApy(
            borrowRate,
            borrowableDecimal,
            totalBorrows,
            totalSupply,
            reserveFactor
          );
          let poolId = await transformTarotLPName(
            underlyingLiquidityPoolSymbol,
            lendingPoolAddress,
            tokenDetailsDict[tokens[0]].symbol,
            tokenDetailsDict[tokens[1]].symbol,
            tokenSymbol,
            chain,
            block
          );
          // if poolId is undefined, probably abi is not published so skip
          if (poolId === undefined) {
            continue;
          }
          const key = `${transformTokenForApi(
            chain,
            underlyingTokenAddress,
            transform
          )}`;
          // ignore pools where we can not find the price
          if (
            !fetchedPrices[key.toLowerCase()] ||
            !fetchedPrices[key.toLowerCase()].price
          ) {
            continue;
          }
          // tvl calculations
          const underlyingTokenPriceUsd =
            fetchedPrices[key.toLowerCase()].price;
          const totalTvl = caculateTvl(
            excessSupply,
            tokenDecimals,
            underlyingTokenPriceUsd,
            lpReserve
          );
          let poolData = {
            pool: `${poolId}`,
            chain: chain,
            project: protocolSlug,
            symbol: utils.formatSymbol(tokenSymbol),
            tvlUsd: totalTvl.toNumber(),
            apy: supplyRateAPY.times(BigNumber(100)).toNumber(),
          };
          // add the data if the supply apy exists and the total tvl is under the threshold

          if (!supplyRateAPY.isNaN()) {
            if (!supplyRateAPY.isNaN()) {
              ctr++;
              if (ctr > 1) {
                ctr = 0;
              }
              data.push(poolData);
            }
          }
        }
      }
    }
  }
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
