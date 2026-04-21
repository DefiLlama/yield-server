const sdk = require('@defillama/sdk');
const axios = require('axios');

// Production API URL
const API_BASE_URL = 'https://prod-vault-api.hedgemony.xyz';

// SherpaVault (shUSD) contract addresses - same address via CREATE2
const SHERPA_VAULT = '0x96043804D00DCeC238718EEDaD9ac10719778380';

// WMON token address on Monad (Merkl incentives)
const WMON_TOKEN = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';

// Chain configurations
const chains = {
  ethereum: {
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  base: {
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  monad: {
    usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  },
};

const abi = {
  totalStaked: 'function totalStaked() view returns (uint256)',
  totalPending: 'function totalPending() view returns (uint256)',
  stableWrapper: 'function stableWrapper() view returns (address)',
};

/**
 * Fetches APY data from the Sherpa API endpoint.
 * Returns the 7-day rolling average for base USDC yield, points yield, and Merkl incentive yield.
 * @returns {Promise<Object>} Object containing usdcApy, pointsApy, incentiveApy, and totalRewardApy
 * @throws {Error} When API request fails
 */
async function fetchYieldData() {
  try {
    // Fetch all APY data from vault snapshots endpoint
    const snapshotsRes = await axios.get(`${API_BASE_URL}/vault-snapshots`, {
      params: { limit: 1 }
    });

    const latestSnapshot = snapshotsRes.data[0];

    // Extract APY breakdown from snapshot
    const usdcApy = latestSnapshot?.apy?.base ? parseFloat(latestSnapshot.apy.base) : 0;
    const pointsApy = latestSnapshot?.apy?.points ? parseFloat(latestSnapshot.apy.points) : 0;
    const incentiveApy = latestSnapshot?.apy?.incentive ? parseFloat(latestSnapshot.apy.incentive) : 0;

    return {
      usdcApy,
      pointsApy,
      incentiveApy,
      totalRewardApy: pointsApy + incentiveApy,
    };
  } catch (error) {
    console.error('Error fetching yield data from Sherpa API:', error.message);
    // Throw error to prevent showing pools with 0% APY when API is down
    throw new Error('Failed to fetch APY data from Sherpa API');
  }
}

/**
 * Fetches pool data for a specific chain by querying on-chain TVL and combining with yield data.
 * @param {string} chain - The blockchain network (ethereum, base, or monad)
 * @param {Object} yieldData - APY data object from fetchYieldData()
 * @returns {Promise<Object|null>} Pool object formatted for DefiLlama, or null if TVL < $10k or error occurs
 */
async function getPoolData(chain, yieldData) {
  try {
    // Get on-chain TVL data
    const calls = [
      { target: SHERPA_VAULT, abi: abi.totalStaked },
      { target: SHERPA_VAULT, abi: abi.totalPending },
      { target: SHERPA_VAULT, abi: abi.stableWrapper },
    ];

    const [totalStaked, totalPending, wrapperAddress] = await Promise.all(
      calls.map((call) =>
        sdk.api.abi.call({
          target: call.target,
          abi: call.abi,
          chain,
        }).then((res) => res.output)
      )
    );

    // TVL in USD (USDC is 6 decimals)
    const tvlUsd = (Number(totalStaked) + Number(totalPending)) / 1e6;

    // Skip if TVL below DefiLlama minimum threshold
    if (tvlUsd < 10000) {
      return null;
    }

    // Build pool metadata description
    let poolMetaParts = [`USDC: ${yieldData.usdcApy.toFixed(2)}%`];
    if (yieldData.pointsApy > 0) {
      poolMetaParts.push(`Points: ${yieldData.pointsApy.toFixed(2)}%`);
    }
    if (yieldData.incentiveApy > 0) {
      poolMetaParts.push(`Merkl: ${yieldData.incentiveApy.toFixed(2)}%`);
    }

    return {
      pool: `${SHERPA_VAULT}-${chain}`.toLowerCase(),
      chain,
      project: 'sherpa',
      symbol: 'shUSD',
      tvlUsd,
      apyBase: yieldData.usdcApy,
      apyReward: yieldData.totalRewardApy,
      rewardTokens: yieldData.incentiveApy > 0 ? [WMON_TOKEN] : [],
      underlyingTokens: [chains[chain].usdc, wrapperAddress],
      poolMeta: poolMetaParts.join(' + '),
      url: 'https://app.sherpa.trade/earn',
    };
  } catch (error) {
    console.error(`Error fetching pool data for ${chain}:`, error.message);
    return null;
  }
}

/**
 * Main adapter function that fetches and returns all Sherpa vault pools across supported chains.
 * Combines API-sourced yield data with on-chain TVL data for each chain.
 * @returns {Promise<Array>} Array of pool objects, or empty array if API fails
 */
async function apy() {
  try {
    // Fetch yield data once from API (applies to all chains)
    const yieldData = await fetchYieldData();

    // Get pool data for each chain with the fetched yield data
    const pools = await Promise.all(
      Object.keys(chains).map((chain) => getPoolData(chain, yieldData))
    );

    // Filter out null pools (errors or TVL too low)
    return pools.filter((pool) => pool !== null);
  } catch (error) {
    // If API fails, return empty array rather than showing 0% APY pools
    console.error('Sherpa adapter failed:', error.message);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sherpa.trade/earn',
};
