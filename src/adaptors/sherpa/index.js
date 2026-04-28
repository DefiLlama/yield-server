const sdk = require('@defillama/sdk');
const { getMerklRewardsByIdentifier } = require('../merkl/merkl-by-identifier');

// SherpaVault (shUSD) contract addresses - same address via CREATE2
const SHERPA_VAULT = '0x96043804D00DCeC238718EEDaD9ac10719778380';

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
  vaultState: 'function vaultState() view returns (uint16 round, uint128 totalPending)',
  roundPricePerShare: 'function roundPricePerShare(uint256 round) view returns (uint256)',
};

/**
 * Calculates 7-day rolling average APY from onchain share price history.
 * Queries the last 7 rounds of share prices and calculates APY for each round-to-round change.
 * @param {string} chain - The blockchain network
 * @returns {Promise<number>} 7-day rolling average APY as a percentage
 */
async function calculateBaseApy(chain) {
  try {
    // Get current round
    const vaultState = await sdk.api.abi.call({
      target: SHERPA_VAULT,
      abi: abi.vaultState,
      chain,
    });

    const currentRound = vaultState.output.round;

    // Need at least 8 rounds of history (to calculate 7 daily changes)
    if (currentRound < 8) {
      return 0;
    }

    // Query share prices for last 8 rounds (to get 7 round-to-round changes)
    const roundsToQuery = [];
    for (let i = 0; i < 8; i++) {
      roundsToQuery.push(currentRound - 1 - i); // -1 because roundPricePerShare is for previous round
    }

    const pricesCalls = roundsToQuery.map((round) => ({
      target: SHERPA_VAULT,
      params: [round],
    }));

    const pricesResults = await sdk.api.abi.multiCall({
      abi: abi.roundPricePerShare,
      calls: pricesCalls,
      chain,
    });

    const prices = pricesResults.output.map((result) => Number(result.output));

    // Calculate APY for each round-to-round change
    const apys = [];
    for (let i = 0; i < prices.length - 1; i++) {
      const priceNew = prices[i];
      const priceOld = prices[i + 1];

      if (priceOld === 0) continue;

      // Daily return = (priceNew / priceOld) - 1
      const dailyReturn = (priceNew / priceOld) - 1;

      // Annualize: ((1 + dailyReturn)^365 - 1) * 100
      const apy = (Math.pow(1 + dailyReturn, 365) - 1) * 100;

      apys.push(apy);
    }

    if (apys.length === 0) {
      return 0;
    }

    // Return average APY
    const averageApy = apys.reduce((sum, apy) => sum + apy, 0) / apys.length;
    return averageApy;
  } catch (error) {
    console.error(`Error calculating base APY for ${chain}:`, error.message);
    return 0;
  }
}

/**
 * Fetches pool data for a specific chain by querying on-chain TVL and calculating APY.
 * @param {string} chain - The blockchain network (ethereum, base, or monad)
 * @returns {Promise<Object|null>} Pool object formatted for DefiLlama, or null if TVL < $10k or error occurs
 */
async function getPoolData(chain) {
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

    // Calculate base APY from onchain share price history
    const baseApy = await calculateBaseApy(chain);

    return {
      pool: `${SHERPA_VAULT}-${chain}`.toLowerCase(),
      chain,
      project: 'sherpa',
      symbol: 'shUSD',
      tvlUsd,
      apyBase: baseApy,
      underlyingTokens: [chains[chain].usdc, wrapperAddress],
      poolMeta: 'Sherpa Points',
      url: 'https://app.sherpa.trade/earn',
    };
  } catch (error) {
    console.error(`Error fetching pool data for ${chain}:`, error.message);
    return null;
  }
}

/**
 * Main adapter function that fetches and returns all Sherpa vault pools across supported chains.
 * Calculates base APY from onchain data and adds Merkl rewards using DefiLlama helpers.
 * @returns {Promise<Array>} Array of pool objects
 */
async function apy() {
  try {
    // Get pool data for each chain
    const pools = await Promise.all(
      Object.keys(chains).map((chain) => getPoolData(chain))
    );

    // Filter out null pools (errors or TVL too low)
    const validPools = pools.filter((pool) => pool !== null);

    // Add Merkl rewards for each pool
    const poolsWithMerkl = await Promise.all(
      validPools.map(async (pool) => {
        const merklRewards = await getMerklRewardsByIdentifier(
          SHERPA_VAULT,
          pool.chain
        );

        if (!merklRewards) {
          return pool;
        }

        return {
          ...pool,
          apyReward: merklRewards.apyReward,
          rewardTokens: merklRewards.rewardTokens,
        };
      })
    );

    return poolsWithMerkl;
  } catch (error) {
    console.error('Sherpa adapter failed:', error.message);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sherpa.trade/earn',
};
