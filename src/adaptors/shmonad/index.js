const sdk = require('@defillama/sdk');
const axios = require('axios');

// Time constants
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;

// Contract address
const SHMONAD_CONTRACT = '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c';

// ABI for contract functions
const SHMONAD_ABI = {
  getAtomicCapital: 'function getAtomicCapital() view returns (uint256 allocated, uint256 distributed)',
  getCurrentAssets: 'function getCurrentAssets() view returns (uint256)',
  getWorkingCapital: 'function getWorkingCapital() view returns (uint256 staked, uint256 reserved)',
  totalAssets: 'function totalAssets() external view returns (uint256)',
  totalSupply: 'erc20:totalSupply',
  symbol: 'erc20:symbol',
};

// APY window in days
const APY_WINDOW_DAYS = 2;

const apy = async () => {
  // Get current timestamp
  const now = Math.floor(Date.now() / 1000);
  const timestamp2daysAgo = now - SECONDS_PER_DAY * APY_WINDOW_DAYS;

  // Fetch block numbers for current and 2 days ago
  const [blockNow, block2daysAgo] = await Promise.all([
    axios
      .get(`https://coins.llama.fi/block/monad/${now}`)
      .then((r) => r.data.height),
    axios
      .get(`https://coins.llama.fi/block/monad/${timestamp2daysAgo}`)
      .then((r) => r.data.height),
  ]);

  if (!blockNow || !block2daysAgo) {
    throw new Error('RPC issue: Failed to fetch block numbers');
  }

  // Fetch current totalAssets, totalSupply, and symbol
  const [totalAssetsNow, totalSupplyNow, symbol] = await Promise.all([
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.totalAssets,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.totalSupply,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.symbol,
      chain: 'monad',
    }),
  ]);

  // Fetch 2 days ago totalAssets and totalSupply
  const [totalAssets2daysAgo, totalSupply2daysAgo] = await Promise.all([
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.totalAssets,
      chain: 'monad',
      block: block2daysAgo,
    }),
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.totalSupply,
      chain: 'monad',
      block: block2daysAgo,
    }),
  ]);

  if (
    !totalAssetsNow.output ||
    !totalSupplyNow.output ||
    !totalAssets2daysAgo.output ||
    !totalSupply2daysAgo.output
  ) {
    throw new Error('RPC issue: Failed to fetch contract data');
  }

  // Calculate share values (multiply by 1e18 to handle decimals)
  const shareValueNow =
    (BigInt(totalAssetsNow.output) * BigInt(1e18)) /
    BigInt(totalSupplyNow.output);
  const shareValue2daysAgo =
    (BigInt(totalAssets2daysAgo.output) * BigInt(1e18)) /
    BigInt(totalSupply2daysAgo.output);

  if (shareValue2daysAgo === 0n) {
    throw new Error('RPC issue: Previous share value is zero');
  }

  // Calculate proportion: shareValueNow / shareValue2daysAgo
  // Multiply by 1e18 to maintain precision
  const proportion =
    Number((shareValueNow * BigInt(1e18)) / shareValue2daysAgo) / 1e18;

  if (proportion <= 0) {
    throw new Error('RPC issue: Invalid proportion calculated');
  }

  // Calculate APY using the formula:
  // APY = (proportion ^ (365 / APY_WINDOW_DAYS) - 1) * 100
  // This annualizes the 2-day return
  const periodsPerYear = DAYS_PER_YEAR / APY_WINDOW_DAYS;
  const apyBase = (Math.pow(proportion, periodsPerYear) - 1) * 100;

  // Calculate TVL using the same methodology as the TVL adaptor
  // TVL = staked + reserved + allocated - distributed + currentAssets
  const [atomicCapital, currentAssetsValue, workingCapital] = await Promise.all([
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.getAtomicCapital,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.getCurrentAssets,
      chain: 'monad',
      block: blockNow,
    }),
    sdk.api.abi.call({
      target: SHMONAD_CONTRACT,
      abi: SHMONAD_ABI.getWorkingCapital,
      chain: 'monad',
      block: blockNow,
    }),
  ]);

  if (
    !atomicCapital.output ||
    !currentAssetsValue.output ||
    !workingCapital.output
  ) {
    throw new Error('RPC issue: Failed to fetch TVL data');
  }

  // Extract values from the results
  // getAtomicCapital returns a tuple: {allocated, distributed} or [allocated, distributed]
  const allocated = atomicCapital.output.allocated || atomicCapital.output[0];
  const distributed = atomicCapital.output.distributed || atomicCapital.output[1];

  // getWorkingCapital returns a tuple: {staked, reserved} or [staked, reserved]
  const staked = workingCapital.output.staked || workingCapital.output[0];
  const reserved = workingCapital.output.reserved || workingCapital.output[1];

  // Calculate TVL: staked + reserved + allocated - distributed + currentAssets
  const tvlBigInt =
    BigInt(staked) +
    BigInt(reserved) +
    BigInt(allocated) -
    BigInt(distributed) +
    BigInt(currentAssetsValue.output);

  // Convert to number (assuming 18 decimals for MON)
  const tvlMon = Number(tvlBigInt) / 1e18;

  // Get MON native token price to convert to USD
  let tvlUsd;
  try {
    const monPriceResponse = await axios.get(
      'https://coins.llama.fi/prices/current/coingecko:monad'
    );
    const monPrice =
      monPriceResponse.data.coins['coingecko:monad']?.price || 1;
    tvlUsd = tvlMon * monPrice;
  } catch (error) {
    // If price lookup fails, use TVL in MON as-is (assuming 1:1 with USD)
    tvlUsd = tvlMon;
  }

  return [
    {
      pool: SHMONAD_CONTRACT.toLowerCase(),
      chain: 'monad',
      project: 'shmonad',
      symbol: 'shMON',
      tvlUsd: tvlUsd,
      apyBase: apyBase,
      underlyingTokens: [SHMONAD_CONTRACT],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://shmonad.xyz',
};

