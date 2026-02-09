const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const utils = require('../utils');

const abiLendingPool = require('./abi/abiLendingPool.json');
const abiOracle = require('./abi/abiOracle.json');
const abiGMIncentives = require('./abi/abiGMIncentives.json');
const abiInterestRateModel = require('./abi/abiInterestRateModel.json');
const abiUniswapV3Pool = require('./abi/abiUniswapV3Pool.json');
const abiGMI = require('./abi/abiGMI.json');

const { getGloopPrice } = require('./getGloopPrice');
const { getSupplyAPY } = require('./getSupplyAPY');
const { getRewardAPY } = require('./getRewardAPY');

// Contract addresses on Arbitrum
const {ADDRESSES, CHAIN} = require('./Constants');

/**
 * Main function to fetch pool data
 */
const apy = async () => {
  try {
    // Fetch total underlying USDC in the lending pool
    const totalUnderlyingResult = await sdk.api.abi.call({
      target: ADDRESSES.LENDING_POOL,
      abi: abiLendingPool.find((m) => m.name === 'totalUnderlying'),
      params: [ADDRESSES.USDC],
      chain: CHAIN,
    });

    const totalUnderlying = BigInt(totalUnderlyingResult.output);

    // Fetch total borrows
    const totalBorrowsResult = await sdk.api.abi.call({
      target: ADDRESSES.LENDING_POOL,
      abi: abiLendingPool.find((m) => m.name === 'totalBorrows'),
      params: [ADDRESSES.USDC],
      chain: CHAIN,
    });

    const totalBorrows = BigInt(totalBorrowsResult.output);

    // Fetch available liquidity
    const availableLiquidityResult = await sdk.api.abi.call({
      target: ADDRESSES.LENDING_POOL,
      abi: abiLendingPool.find((m) => m.name === 'availableLiquidity'),
      params: [ADDRESSES.USDC],
      chain: CHAIN,
    });

    const availableLiquidity = BigInt(availableLiquidityResult.output);

    // Get USDC price (should be ~$1, but fetch from oracle to be accurate)
    const usdcPriceResult = await sdk.api.abi.call({
      target: ADDRESSES.ORACLE,
      abi: abiOracle.find((m) => m.name === 'getUnderlyingPrice'),
      params: [ADDRESSES.USDC],
      chain: CHAIN,
    });

    // Oracle returns price in 1e18 format, convert to decimal
    const usdcPrice = Number(BigInt(usdcPriceResult.output)) / 1e18;

    // Calculate TVL in USD
    // For lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
    // totalSupplyUsd = totalUnderlying * price
    // totalBorrowUsd = totalBorrows * price
    const totalUnderlyingDecimal = Number(totalUnderlying) / 1e6; // USDC has 6 decimals
    const totalBorrowsDecimal = Number(totalBorrows) / 1e6;

    const totalSupplyUsd = totalUnderlyingDecimal * usdcPrice;
    const totalBorrowUsd = totalBorrowsDecimal * usdcPrice;
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    // Get GLOOP price
    const gloopPrice = await getGloopPrice();

    // Calculate supply APY
    const apyBase = await getSupplyAPY(
      availableLiquidity.toString(),
      totalBorrows.toString()
    );

    // Calculate reward APY
    const apyReward = await getRewardAPY(gloopPrice, totalUnderlyingDecimal);

    // Create pool identifier
    const poolIdentifier = `${ADDRESSES.RECEIVED_TOKEN}-${CHAIN}`.toLowerCase();

    const pool = {
      pool: poolIdentifier,
      chain: utils.formatChain(CHAIN),
      project: 'gloop',
      symbol: 'USDC',
      tvlUsd: tvlUsd,
      apyBase: apyBase * 100,
      apyReward: apyReward > 0 ? apyReward * 100 : null,
      rewardTokens: apyReward > 0 ? [ADDRESSES.GLOOP] : null,
      underlyingTokens: [ADDRESSES.USDC],
      poolMeta: 'V1 market',
      url: 'https://gloop.finance/',
      // Lending protocol specific fields
      totalSupplyUsd: totalSupplyUsd,
      totalBorrowUsd: totalBorrowUsd,
    };

    return [pool];
  } catch (error) {
    console.error('Error in Gloop adapter:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.gloop.finance/loop',
};

// async function main() {
//   console.log(await apy());
// }

// main()
