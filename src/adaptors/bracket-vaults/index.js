const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

const CHAIN = "ethereum";

// Configuration constants
const DAYS_PER_YEAR = 365;
const SECONDS_PER_DAY = 86400;

// Contract addresses
const ADDRESSES = {
    vaults: {
      brUSDC: '0xb8ca40E2c5d77F0Bc1Aa88B2689dddB279F7a5eb', //  USDC+ Vault
      brETH: '0x3588e6Cb5DCa99E35bA2E2a5D42cdDb46365e71B', // ETH+ Vault
      bravUSDC: '0x9f96E4B65059b0398B922792d3fF9F10B4567533', // Avant+ Vault
    },
    underlyingTokens: {
      brUSDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      brETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      bravUSDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    }
};

const BRACKET_LENS_ADDRESS = '0xcdc3a8374532Ddb762c76604f30F6a9FDd29082c'

const VAULT_DECIMALS = {
  '0xb8ca40E2c5d77F0Bc1Aa88B2689dddB279F7a5eb': 6,
  '0x3588e6Cb5DCa99E35bA2E2a5D42cdDb46365e71B': 18,
  '0x9f96E4B65059b0398B922792d3fF9F10B4567533': 6,
}

const VAULT_START_TIMESTAMP = {
  '0xb8ca40E2c5d77F0Bc1Aa88B2689dddB279F7a5eb': 1750111200,
  '0x3588e6Cb5DCa99E35bA2E2a5D42cdDb46365e71B': 1755727200,
  '0x9f96E4B65059b0398B922792d3fF9F10B4567533': 1754258400,
}

const UNDERLYING_SYMBOL = {
  brUSDC: 'USDC',
  brETH: 'wETH',
  bravUSDC: 'USDC'
};

const getVaultData = async (vaultAddress) => {
  const epoch = await sdk.api.abi.call({
    target: vaultAddress,
    abi: "function epoch() view returns (uint16)",
    chain: CHAIN,
  });

  const queryEpoch = epoch.output - 1;

  console.log("epoch:", epoch.output);
  console.log("queryEpoch:", queryEpoch);
  
  const nav = await sdk.api.abi.call({
    target: vaultAddress,
    abi: "function navs(uint16 epoch) view returns (uint256)",
    chain: CHAIN,
    params: [queryEpoch],
  });

  console.log("nav:", nav.output);
  
  const nextLock = await sdk.api.abi.call({
    target: vaultAddress,
    abi: "function nextLock() view returns (uint48)",
    chain: CHAIN,
  });
  console.log("nextLock:", nextLock.output);
  const lockFrequency = await sdk.api.abi.call({
    target: vaultAddress,
    abi: "function lockFrequency() view returns (uint48)",
    chain: CHAIN,
  });
  console.log("lockFrequency:", lockFrequency.output);

  const lastLock = nextLock.output - lockFrequency.output;

  console.log("lastLock:", lastLock);

  return {lastLock, nav: nav.output};
}

const getVaultAPY = async (vaultAddress) => {
  const { lastLock, nav } = await getVaultData(vaultAddress);

  const startTimestamp = VAULT_START_TIMESTAMP[vaultAddress];
  const startNav = Math.pow(10, VAULT_DECIMALS[vaultAddress]);

  const ratio = Number(nav) / Number(startNav);
  if (ratio <= 0) {
    console.error(`Error fetching vault data for ${vaultAddress}:`, 'ratio <= 0');
    return 0;
  }
  console.log("ratio:", ratio);

  const elapsedDays = Math.floor((lastLock - startTimestamp) / SECONDS_PER_DAY);
  if (elapsedDays <= 0) {
    console.error(`Error fetching vault data for ${vaultAddress}:`, 'elapsedSeconds <= 0');
    return 0;
  };
  console.log("elapsedDays:", elapsedDays);

  const elapsedYears = Number(elapsedDays) / DAYS_PER_YEAR;
  if (elapsedYears <= 0) {
    console.error(`Error fetching vault data for ${vaultAddress}:`, 'elapsedYears <= 0');
    return 0;
  }
  console.log("elapsedYears:", elapsedYears);


  // // If less than a year elapsed, annualize compounding return to be APY
  // // APY = (ratio)^(1/elapsedYears) - 1, even if elapsedYears < 1
  return (Math.pow(ratio, 1 / elapsedYears) - 1) * 100;
}


const getTokenPrice = async (priceKey, amount, decimals) => {
  try {
    const response = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`);
    if (!response.data?.coins?.[priceKey]?.price) {
      console.warn(`No price found for ${priceKey}`);
      return 0;
    }
    return (response.data.coins[priceKey].price * amount) / 10 ** decimals;
  } catch (error) {
    console.error(`Error fetching price for ${priceKey}:`, error.message);
    return 0;
  }
};

const getVaultTVL = async (vaultType, vaultAddress, vaultDecimals) => {
  const underlyingAddress = ADDRESSES.underlyingTokens[vaultType];
  const priceKey = `${CHAIN}:${underlyingAddress}`;
  
  const tvl = await sdk.api.abi.call({
    target: BRACKET_LENS_ADDRESS,
    abi: "function getTVL(address vault) view returns (uint256)",
    chain: CHAIN,
    params: [vaultAddress],
  })

  return getTokenPrice(priceKey, Number(tvl.output), vaultDecimals);
};


const main = async () => {
  const pools = [];

  for (const [vaultType, vaultAddress] of Object.entries(ADDRESSES.vaults)) {
    try {
      const vaultDecimals = VAULT_DECIMALS[vaultAddress];
      const tvlUSD = await getVaultTVL(vaultType, vaultAddress, vaultDecimals);
      const apy = await getVaultAPY(vaultAddress);
      
      if (tvlUSD !== undefined && apy !== undefined) {
        pools.push({
          pool: vaultAddress,
          chain: utils.formatChain(CHAIN),
          project: 'bracket-vaults',
          symbol: UNDERLYING_SYMBOL[vaultType],
          tvlUsd: Number(tvlUSD.toFixed(2)),
          apyBase: Number(apy.toFixed(2)),
          underlyingTokens: [ADDRESSES.underlyingTokens[vaultType]],
        });
      }

    } catch (error) {
      console.error(`Error processing vault ${vaultType}:`, error.message);
    }
  }


  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://bracket.fi/'
}; 
