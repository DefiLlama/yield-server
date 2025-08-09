const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const vaultABI = require('./abiVault.json');

// Configuration constants
const SECONDS_PER_YEAR = 31536000;
const WEEKS_PER_YEAR = 52;

// Contract addresses
const ADDRESSES = {
  ethereum: {
    vaults: {
      xUSD: '0xE2Fc85BfB48C4cF147921fBE110cf92Ef9f26F94',
      xBTC: '0x12fd502e2052CaFB41eccC5B596023d9978057d6',
      xETH: '0x7E586fBaF3084C0be7aB5C82C04FfD7592723153',
      xEUR: '0xc15697f61170Fc3Bb4e99Eb7913b4C7893F64F13',
    },
    wrappers: {
      xUSD: '0x6eAf19b2FC24552925dB245F9Ff613157a7dbb4C',
      xBTC: '0x12fd502e2052CaFB41eccC5B596023d9978057d6',
      xETH: '0xF70f54cEFdCd3C8f011865685FF49FB80A386a34',
      xEUR: '0xDCFd98A5681722DF0d93fc11b9205f757576a427',
    },
    underlyingTokens: {
      xUSD: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      xBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      xETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      xEUR: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c', // EURC
    }
  }
};

const VAULT_DECIMALS = {
  '0xE2Fc85BfB48C4cF147921fBE110cf92Ef9f26F94': 6,
  '0x12fd502e2052CaFB41eccC5B596023d9978057d6': 8,
  '0x7E586fBaF3084C0be7aB5C82C04FfD7592723153': 18,
  '0xc15697f61170Fc3Bb4e99Eb7913b4C7893F64F13': 6,
}


const UNDERLYING_SYMBOL_MAP = {
  XUSD: 'USDC',
  XBTC: 'wBTC',
  XETH: 'wETH'
};


const mapToUnderlying = (vault) => UNDERLYING_SYMBOL_MAP[vault] || vault;

const getContractData = async (target, abi, chain, params = []) => {
  try {
    sdk.api.config.setProvider(
      'ethereum',
      new ethers.providers.JsonRpcProvider(
        'https://eth.llamarpc.com'
      )
    );
    const result = await sdk.api.abi.call({
      target,
      abi: vaultABI.find((m) => m.name === abi),
      chain,
      params
    });
    return result.output;
  } catch (error) {
    console.error(`Error fetching ${abi} for ${target}:`, error.message);
    throw error;
  }
};

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


const getVaultAPY = async (vaultAddress, chain) => {
  const vaultState = await getContractData(vaultAddress, 'vaultState', chain);
  const currRound = vaultState.round;
  
  // Look at last 7 rounds to get a weekly average
  const numRoundsToAnalyze = 7;
  const startRound = Math.max(1, currRound - numRoundsToAnalyze);
  
  let pricePerShareValues = [];
  
  // Collect price per share for each round
  for (let round = startRound; round < currRound; round++) {
    try {
      const pricePerShare = await getContractData(
        vaultAddress,
        'roundPricePerShare',
        chain,
        [round]
      );
      pricePerShareValues.push(pricePerShare);
    } catch (error) {
      console.error(`Error fetching price per share for round ${round}:`, error.message);
    }
  }
  
  if (pricePerShareValues.length < 2) {
    console.warn('Not enough price data to calculate APY');
    return 0;
  }
  
  // Calculate daily yield rates
  const dailyYields = [];
  for (let i = 1; i < pricePerShareValues.length; i++) {
    const prevPrice = pricePerShareValues[i - 1];
    const currPrice = pricePerShareValues[i];
    if (prevPrice && prevPrice > 0) {
      const dailyYield = (currPrice - prevPrice) / prevPrice;
      dailyYields.push(dailyYield);
    }
  }
  
  if (dailyYields.length === 0) {
    console.warn('No valid yield rates calculated');
    return 0;
  }
  
  // Calculate average daily yield
  const avgDailyYield = dailyYields.reduce((sum, yieldRate) => sum + yieldRate, 0) / dailyYields.length;
  
  // Convert to APY using compound interest formula
  // APY = (1 + r)^n - 1, where r is the periodic rate and n is number of periods
  const periodsPerYear = 365; // Daily compounding
  const apy = (Math.pow(1 + avgDailyYield, periodsPerYear) - 1) * 100;
  
  return Number.isFinite(apy) ? Number(apy.toFixed(2)) : 0;
};

const getVaultTVL = async (chain, vaultType, vaultDecimals) => {
  const wrapperAddress = ADDRESSES[chain].wrappers[vaultType];
  const underlyingAddress = ADDRESSES[chain].underlyingTokens[vaultType];
  const priceKey = `${chain}:${underlyingAddress}`;
  
  const totalSupply = await getContractData(wrapperAddress, 'totalSupply', chain);
  
  return getTokenPrice(priceKey, Number(totalSupply), vaultDecimals);
};


const main = async () => {
  const pools = [];
  
  for (const chain of Object.keys(ADDRESSES)) {
    for (const [vaultType, vaultAddress] of Object.entries(ADDRESSES[chain].vaults)) {
      try {
        const vaultDecimals = VAULT_DECIMALS[vaultAddress];
        const underlyingTicker = mapToUnderlying(utils.formatSymbol(vaultType));
        const tvlUSD = await getVaultTVL(chain, vaultType, vaultDecimals);
        const apy = await getVaultAPY(vaultAddress, chain);
        
        if (tvlUSD !== undefined && apy !== undefined) {
          pools.push({
            pool: `${vaultAddress}-${chain}`,
            chain: utils.formatChain(chain),
            project: 'stream-finance',
            symbol: underlyingTicker,
            tvlUsd: Number(tvlUSD.toFixed(2)),
            apyBase: Number(apy.toFixed(2)),
            underlyingTokens: [ADDRESSES[chain].underlyingTokens[vaultType]],
            poolMeta: utils.formatSymbol(vaultType)
          });
        }

      } catch (error) {
        console.error(`Error processing vault ${vaultType} on ${chain}:`, error.message);
      }
    }
  }


  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.streamprotocol.money'
}; 
