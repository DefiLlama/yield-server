const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const abiUniswapV3Pool = require('./abi/abiUniswapV3Pool.json');

const {getGMIPrice} = require('./getGMIPrice');

const {ADDRESSES, CHAIN} = require('./Constants');
/**
 * Fetches the GLOOP token price using Uniswap V3 pool and GMI contract
 * Route: GLOOP -> GMI (from V3 pool) -> USD (from GMI contract)
 */
const getGloopPrice = async () => {
  try {
    // Not listed on DefiLlama so this approach not used
    // const priceKey = `${CHAIN}:${ADDRESSES.GLOOP}`;
    // const priceData = await axios.get(
    //   `https://coins.llama.fi/prices/current/${priceKey}`
    // );

    // if (priceData.data?.coins?.[priceKey]?.price) {
    //   console.log('Using GLOOP price from DeFiLlama:', priceData.data.coins[priceKey].price);
    //   return priceData.data.coins[priceKey].price;
    // }

    // Step 1: Get GMI price in USD from GMI contract
    const gmiPriceInUSD = await getGMIPrice();

    if (!gmiPriceInUSD || gmiPriceInUSD <= 0) {
      console.warn('GMI price not available');
      return 0;
    }

    console.log('GMI price in USD:', gmiPriceInUSD);

    // Step 2: Get GLOOP/GMI price from Uniswap V3 pool
    const slot0Result = await sdk.api.abi.call({
      target: ADDRESSES.GLOOP_GMI_V3_POOL,
      abi: abiUniswapV3Pool.find((m) => m.name === 'slot0'),
      chain: CHAIN,
    });

    if (!slot0Result.output || !Array.isArray(slot0Result.output)) {
      console.warn('Unable to fetch slot0 from GLOOP/GMI V3 pool');
      return 0;
    }

    const sqrtPriceX96 = new BigNumber(slot0Result.output[0].toString());

    if (sqrtPriceX96.isZero()) {
      console.warn('Invalid sqrtPriceX96 (zero) from GLOOP/GMI V3 pool');
      return 0;
    }

    // Convert sqrtPriceX96 to price
    // price = (sqrtPriceX96 / 2^96)^2
    const twoPow96 = new BigNumber(2).pow(96);
    const sqrtPrice = sqrtPriceX96.dividedBy(twoPow96);
    const gloopGmiPrice = sqrtPrice.pow(2);

    console.log('GLOOP/GMI price from V3 pool:', gloopGmiPrice.toString());

    // Step 3: Calculate GLOOP price in USD
    // GLOOP/USD = GLOOP/GMI * GMI/USD
    const gloopUsdPrice = gloopGmiPrice.multipliedBy(gmiPriceInUSD);

    console.log('Calculated GLOOP/USD price:', gloopUsdPrice.toNumber());

    return gloopUsdPrice.toNumber();
  } catch (error) {
    console.error('Error fetching GLOOP price:', error);
    return 0;
  }
};

module.exports = {
  getGloopPrice,
};


getGloopPrice();