const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { formatChain } = require('../utils');
const axios = require('axios');

const CONFIG = {
  SFLR_ADDRESS: '0x12e605bc104e93b45e1ad99f9e555f659051c2bb',
  WFLR_ADDRESS: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  FLARE_CHAIN: 'flare',
  PRICE_API: 'https://coins.llama.fi/prices/current',
  REWARDS_API: 'https://rewards.sceptre.fi/v1/flare',
  TIMEOUT_MS: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
};

const ABI = {
  totalPooledFlr: {
    inputs: [],
    name: 'totalPooledFlr',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

async function fetchWithRetry(url, options = {}) {
  for (let i = 0; i < CONFIG.RETRY_ATTEMPTS; i++) {
    try {
      const response = await axios.get(url, {
        timeout: CONFIG.TIMEOUT_MS,
        ...options
      });
      return response.data;
    } catch (error) {
      if (i === CONFIG.RETRY_ATTEMPTS - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS * Math.pow(2, i)));
    }
  }
}

async function fetchTotalPooledFlr() {
  const { output } = await sdk.api.abi.call({
    target: CONFIG.SFLR_ADDRESS,
    abi: ABI.totalPooledFlr,
    chain: CONFIG.FLARE_CHAIN,
  });
  return new BigNumber(output);
}

async function fetchFlarePrice() {
  const priceKey = `${CONFIG.FLARE_CHAIN}:${CONFIG.WFLR_ADDRESS.toLowerCase()}`;
  const pricesResponse = await fetchWithRetry(`${CONFIG.PRICE_API}/${priceKey}`);
  return new BigNumber(pricesResponse.coins[priceKey].price);
}

function calculateTvl(totalPooledFlr, flarePrice) {
  return totalPooledFlr.dividedBy(1e18).multipliedBy(flarePrice);
}

async function fetchStakingApy() {
  const apyResponse = await fetchWithRetry(CONFIG.REWARDS_API);
  return new BigNumber(apyResponse.apy);
}

async function main() {
  try {
    const [totalPooledFlr, flarePrice, stakingApy] = await Promise.all([
      fetchTotalPooledFlr(),
      fetchFlarePrice(),
      fetchStakingApy(),
    ]);

    const tvlUsd = calculateTvl(totalPooledFlr, flarePrice);

    return [{
      pool: CONFIG.SFLR_ADDRESS,
      chain: formatChain(CONFIG.FLARE_CHAIN),
      project: 'sceptre-liquid',
      symbol: 'sFLR',
      tvlUsd: tvlUsd.toNumber(),
      apyBase: stakingApy.multipliedBy(100).toNumber(),
      underlyingTokens: [CONFIG.WFLR_ADDRESS],
      poolMeta: 'Unstaking Cooldown: 14.5days'
    }];
  } catch (error) {
    console.error('Error fetching data:', error.message);
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://flare.sceptre.fi/',
};
