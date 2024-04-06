const utils = require('../utils');
const sdk = require('@defillama/sdk');
const axios = require('axios');

// Curve
const POOL_CONTRACT_LVUSD_3CRV = '0xe9123cbc5d1ea65301d417193c40a72ac8d53501';
const POOL_INDEX_LVUSD = 0;
const POOL_INDEX_3CRV = 1;
// Coingecko
// const COINGECKO_ID_LVUSD = "lvusd"; // Not yet supported by Coingecko
const COINGECKO_ID_3CRV = 'lp-3pool-curve';
const COINGECKO_ID_ARCH = 'archimedes';

// Get USD value from token amount
const getUsdValue = async (tokenId, tokenAmount) => {
  const priceKey = `coingecko:${tokenId}`;
  const usdPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;
  return tokenAmount * usdPrice;
};

// Get token balance of token in curve pool
const getTokenLiquidity = async (tokenIndex) => {
  const liquidity = (
    await sdk.api.abi.call({
      target: POOL_CONTRACT_LVUSD_3CRV,
      abi: {
        inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        name: 'balances',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      chain: 'ethereum',
      params: tokenIndex,
    })
  ).output;
  return liquidity / 1e18;
};

const getTvlUsd = async () => {
  const poolLiquidityLVUSD = await getTokenLiquidity(POOL_INDEX_LVUSD);
  // const poolLiquidityLVUSDInUSD = await getUsdValue(COINGECKO_ID_LVUSD, poolLiquidityLVUSD); // Update once Coingecko supports
  const poolLiquidity3CRV = await getTokenLiquidity(POOL_INDEX_3CRV);
  const poolLiquidity3CRVInUSD = await getUsdValue(
    COINGECKO_ID_3CRV,
    poolLiquidity3CRV
  );
  return poolLiquidityLVUSD + poolLiquidity3CRVInUSD;
};

const getApy = async (tvl) => {
  const weeklyArchEmissions = (
    await axios.get(
      'https://o18rvfj4v9.execute-api.us-east-2.amazonaws.com/default/get-weekly-arch-emissions'
    )
  ).data;
  const weeklyArchEmissionsInUSD = await getUsdValue(
    COINGECKO_ID_ARCH,
    weeklyArchEmissions
  );
  const weeklyYieldUSD = weeklyArchEmissionsInUSD / tvl;
  const dailyYieldUSD = weeklyYieldUSD / 7;
  const yearlyYieldUSD = dailyYieldUSD * 365;
  return yearlyYieldUSD * 100;
};

const main = async () => {
  const tvl = await getTvlUsd();

  const pool = {
    pool: POOL_CONTRACT_LVUSD_3CRV,
    chain: utils.formatChain('Ethereum'),
    project: 'archimedes-finance',
    symbol: utils.formatSymbol('LvUSD'),
    tvlUsd: tvl,
    apy: await getApy(tvl),
  };

  return [pool];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://curve.fi/#/ethereum/pools/factory-v2-268/deposit',
};
