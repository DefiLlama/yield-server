const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// Pool and farming contract addresses from Clipper documentation
// https://docs.clipper.exchange/disclaimers-and-technical/smart-contracts
const CHAINS = {
  ethereum: {
    pool: '0x655edce464cc797526600a462a8154650eee4b77',
    farming: '0xD0454428ecd868A9AC615125FCbDB5Da9027436e',
    sail: '0xd8F1460044925d2D5c723C7054cd9247027415B7',
  },
  optimism: {
    pool: '0x5130f6ce257b8f9bf7fac0a0b519bd588120ed40',
    farming: '0xAc2B3f9a13E7273639bcDCa55742391CDACC74cB',
    sail: '0x7a1263eC3Bf0a19e25C553B8A2C312e903262C5E',
  },
  arbitrum: {
    pool: '0x769728b5298445ba2828c0f3f5384227fbf590c5',
    farming: null, // No farming contract listed
    sail: '0xb52BD62eE0Cf462Fa9CCbDA4bf27Fe84D9ab6Cf7',
  },
  polygon: {
    pool: '0x6bfce69d1df30fd2b2c8e478edec9daa643ae3b8',
    farming: null, // No farming contract listed
    sail: '0xd1a718f77ab5d22e3955050658d7f65ae857a85e',
  },
  base: {
    pool: '0xb32D856cAd3D2EF07C94867A800035E37241247C',
    farming: null,
    sail: null,
  },
  mantle: {
    pool: '0x769728b5298445BA2828c0f3F5384227fbF590C5',
    farming: null,
    sail: null,
  },
  polygon_zkevm: {
    pool: '0xAe00af61bE6861eE956C8e56BF22144d024acb57',
    farming: null,
    sail: null,
  },
};

// SAIL token CoinGecko ID for price fetching
const SAIL_COINGECKO_ID = 'sail-2';

const getPoolTokens = async (poolAddress, chain) => {
  const nTokensResult = await sdk.api.abi.call({
    target: poolAddress,
    abi: 'function nTokens() view returns (uint256)',
    chain,
  });
  const nTokens = parseInt(nTokensResult.output);

  const tokenCalls = [];
  for (let i = 0; i < nTokens; i++) {
    tokenCalls.push({
      target: poolAddress,
      params: [i],
    });
  }

  const tokenAddresses = (
    await sdk.api.abi.multiCall({
      abi: 'function tokenAt(uint256 index) view returns (address)',
      calls: tokenCalls,
      chain,
    })
  ).output.map((o) => o.output);

  return tokenAddresses;
};

const getPoolTvlAndLpPrice = async (poolAddress, chain, tokens, block = null) => {
  const balanceCalls = tokens.map((token) => ({
    target: token,
    params: [poolAddress],
  }));

  const callOptions = block ? { block } : {};

  const [balances, decimals, lpSupply] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain,
      ...callOptions,
    }),
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((token) => ({ target: token })),
      chain,
      ...callOptions,
    }),
    sdk.api.abi.call({
      target: poolAddress,
      abi: 'erc20:totalSupply',
      chain,
      ...callOptions,
    }),
  ]);

  const priceKeys = tokens
    .map((token) => `${chain}:${token.toLowerCase()}`)
    .join(',');
  const pricesResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  const prices = pricesResponse.data.coins;

  let tvlUsd = 0;
  const tokenSymbols = [];

  for (let i = 0; i < tokens.length; i++) {
    const balance = balances.output[i].output;
    const decimal = decimals.output[i].output;
    const priceKey = `${chain}:${tokens[i].toLowerCase()}`;
    const priceData = prices[priceKey];

    if (priceData && balance) {
      const tokenBalance = Number(balance) / 10 ** Number(decimal);
      tvlUsd += tokenBalance * priceData.price;
      tokenSymbols.push(priceData.symbol);
    }
  }

  const lpSupplyNum = Number(lpSupply.output) / 1e18;
  const lpPrice = lpSupplyNum > 0 ? tvlUsd / lpSupplyNum : 0;

  return { tvlUsd, tokenSymbols, underlyingTokens: tokens, lpPrice };
};

// Calculate apyBase by comparing LP token price now vs 7 days ago
// Using 7-day window smooths out daily volatility and provides more stable APY
const calculateApyBase = async (poolAddress, chain, tokens) => {
  try {
    // Get current LP price
    const currentData = await getPoolTvlAndLpPrice(poolAddress, chain, tokens);
    const currentLpPrice = currentData.lpPrice;

    // Get block from 7 days ago
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const [blockSevenDaysAgo] = await utils.getBlocksByTime([sevenDaysAgo], chain);

    // Get LP price 7 days ago
    const pastData = await getPoolTvlAndLpPrice(poolAddress, chain, tokens, blockSevenDaysAgo);
    const pastLpPrice = pastData.lpPrice;

    if (pastLpPrice === 0 || currentLpPrice === 0) return null;

    // Calculate 7-day return and annualise (52 weeks per year)
    const weeklyReturn = (currentLpPrice - pastLpPrice) / pastLpPrice;
    const apyBase = weeklyReturn * 52 * 100;

    // Return 0 if APY is negative (can happen due to IL or price fluctuations)
    return apyBase > 0 ? apyBase : 0;
  } catch (error) {
    console.error(`Error calculating apyBase for ${chain}:`, error.message);
    return null;
  }
};

const getFarmingData = async (farmingAddress, chain) => {
  if (!farmingAddress) return null;

  try {
    const [targetTokensPerDay, totalAssets] = await Promise.all([
      sdk.api.abi.call({
        target: farmingAddress,
        abi: 'function targetTokensPerDay() view returns (uint256)',
        chain,
      }),
      sdk.api.abi.call({
        target: farmingAddress,
        abi: 'function totalAssets() view returns (uint256)',
        chain,
      }),
    ]);

    return {
      targetTokensPerDay: Number(targetTokensPerDay.output) / 1e18,
      totalAssets: Number(totalAssets.output) / 1e18,
    };
  } catch (error) {
    console.error(`Error fetching farming data for ${chain}:`, error.message);
    return null;
  }
};

const getSailPrice = async () => {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${SAIL_COINGECKO_ID}&vs_currencies=usd`,
      { timeout: 10000 }
    );
    return response.data[SAIL_COINGECKO_ID]?.usd || 0;
  } catch (error) {
    console.error('Error fetching SAIL price:', error.message);
    return 0;
  }
};

const calculateApyReward = (farmingData, lpPrice, sailPrice) => {
  if (!farmingData || !lpPrice || !sailPrice || farmingData.totalAssets === 0) {
    return null;
  }

  const { targetTokensPerDay, totalAssets } = farmingData;

  // Calculate yearly reward value
  const dailyRewardUsd = targetTokensPerDay * sailPrice;
  const yearlyRewardUsd = dailyRewardUsd * 365;

  // Calculate staked value in USD
  const stakedValueUsd = totalAssets * lpPrice;

  if (stakedValueUsd === 0) return null;

  // APY = (yearly rewards / staked value) * 100
  const apyReward = (yearlyRewardUsd / stakedValueUsd) * 100;

  return apyReward;
};

const getPoolData = async (chainKey, sailPrice) => {
  const config = CHAINS[chainKey];
  const { pool, farming, sail } = config;

  try {
    const tokens = await getPoolTokens(pool, chainKey);
    const { tvlUsd, tokenSymbols, underlyingTokens, lpPrice } =
      await getPoolTvlAndLpPrice(pool, chainKey, tokens);

    // Get farming data if available
    const farmingData = await getFarmingData(farming, chainKey);

    // Calculate reward APY if farming is available
    const apyReward = calculateApyReward(farmingData, lpPrice, sailPrice);

    // Calculate base APY from LP token price appreciation (fee accrual)
    const apyBase = await calculateApyBase(pool, chainKey, tokens);

    // Format symbol from token symbols
    const symbol = utils.formatSymbol(tokenSymbols.join('-'));

    // Use contract address as pool identifier
    // Append chain for non-ethereum to maintain uniqueness
    const poolId = chainKey === 'ethereum' ? pool : `${pool}-${chainKey}`;

    const result = {
      pool: poolId,
      chain: utils.formatChain(chainKey),
      project: 'clipper',
      symbol,
      tvlUsd,
      underlyingTokens,
      apyBase: apyBase !== null ? apyBase : 0,
    };

    // Add reward APY if farming is available
    if (apyReward !== null && apyReward > 0) {
      result.apyReward = apyReward;
      result.rewardTokens = sail ? [sail] : [];
    }

    return result;
  } catch (error) {
    console.error(`Error fetching Clipper data for ${chainKey}:`, error.message);
    return null;
  }
};

const main = async () => {
  // Get SAIL price first (used across all chains)
  const sailPrice = await getSailPrice();

  const data = await Promise.all(
    Object.keys(CHAINS).map((chainKey) => getPoolData(chainKey, sailPrice))
  );

  return data.filter((pool) => pool !== null && pool.tvlUsd > 0);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://clipper.exchange/app/liquidity/pool',
};
