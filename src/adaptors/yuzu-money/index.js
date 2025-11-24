const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

const chain = 'plasma';

const yzUSD = '0x6695c0f8706c5ace3bdf8995073179cca47926dc';
const syzUSD = '0xc8a8df9b210243c55d31c73090f06787ad0a1bf6';

const yzUSD_unit = 1e18;
const syzUSD_unit = 1e18;

const YEAR_IN_DAYS = 365;
const DAY_IN_SECONDS = 24 * 60 * 60;

const APY_REFERENCE_PERIOD_IN_DAYS = 7;

const getUsdPrice = async () => {
  try {
    const priceKey = `${chain}:${syzUSD}`;
    const { data } = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
    return data.coins[priceKey].price;
  } catch (error) {
    console.error('Error fetching USD price:', error);
    throw error;
  }
};

const getTotalSupply = async () => {
  try {
    const { output } = await sdk.api.abi.call({
      target: syzUSD,
      abi: 'erc20:totalSupply',
      chain,
    });
    return output / syzUSD_unit;
  } catch (error) {
    console.error('Error fetching total supply:', error);
    throw error;
  }
};

const getRedemptionPrice = async (blockNumber) => {
  try {
    const { output } = await sdk.api.abi.call({
      target: syzUSD,
      abi: 'function previewRedeem(uint256 shares) external view returns (uint256)',
      params: [BigInt(syzUSD_unit)],
      chain,
      block: blockNumber,
    });
    return output / yzUSD_unit;
  } catch (error) {
    console.error('Error fetching redemption price:', error);
    throw error;
  }
};

const calculateUsdTvl = async () => {
  try {
    const totalSupply = await getTotalSupply();
    const tokenPrice = await getUsdPrice();
    return totalSupply * tokenPrice;
  } catch (error) {
    console.error('Error calculating USD TVL:', error);
    throw error;
  }
};

const calculateApy = async () => {
  try {
    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const startTimestamp = currentBlock.timestamp - APY_REFERENCE_PERIOD_IN_DAYS * DAY_IN_SECONDS;
    const [startBlock] = await utils.getBlocksByTime([startTimestamp], chain);

    const [startPrice, currentPrice] = await Promise.all([getRedemptionPrice(startBlock), getRedemptionPrice(currentBlock.block)]);

    const appreciationRatio = currentPrice / startPrice;
    const apy = (Math.pow(appreciationRatio, YEAR_IN_DAYS / APY_REFERENCE_PERIOD_IN_DAYS) - 1) * 100;

    return apy;
  } catch (error) {
    console.error('Error calculating APY:', error);
    throw error;
  }
};

const syzUSDPool = async () => {
  try {
    const [tvlUsd, apyBase] = await Promise.all([calculateUsdTvl(), calculateApy()]);
    return {
      tvlUsd,
      apyBase,
      pool: (`${syzUSD}-${chain}`).toLowerCase(),
      chain: 'Plasma',
      project: 'yuzu-money',
      symbol: 'yzUSD',
      underlyingTokens: [yzUSD],
      url: 'https://app.yuzu.money/syzusd',
    };
  } catch (error) {
    console.error('Error fetching pool data:', error);
    throw error;
  }
};

const apy = async () => {
  try {
    return [await syzUSDPool()];
  } catch (error) {
    console.error('Error fetching pools:', error);
    throw error;
  }
};

module.exports = {
  apy,
};
