const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const { CHAIN_CONFIG } = require('./config');
const { getAuraGlobals } = require('./data/subgraph/globals');
const { getSymbols } = require('./data/rpc/erc20');
const { getActivePools } = require('./data/get-active-pools');
const { getPoolTvls } = require('./data/get-pool-tvls');
const { getBalancerData } = require('./data/get-balancer-data');
const { getRewardsData } = require('./data/get-rewards-data');
const { setupRpcProvider } = require('./utils/setup-rpc');
const utils = require('../utils');

async function poolsFunction() {
  const allPools = [];
  const auraGlobals = await getAuraGlobals();
  if (!auraGlobals) {
    return allPools;
  }

  for (const [chainName, chainConfig] of Object.entries(CHAIN_CONFIG)) {
    try {
      // Setup custom RPC provider for this chain if config is present
      setupRpcProvider(chainName, chainConfig);

      const sdkChainName = chainConfig.sdkChainName || chainName;
      const activePools = await getActivePools(sdkChainName, chainConfig);
      if (activePools.length === 0) continue;

      const lpTokens = activePools.map((pool) => pool.lptoken);

      const [symbolsData, tvlsData, balancerData] = await Promise.all([
        getSymbols(lpTokens, sdkChainName),
        getPoolTvls(activePools, sdkChainName),
        getBalancerData(activePools, sdkChainName, chainConfig),
      ]);

      const rewardsData = await getRewardsData(
        activePools,
        chainName,
        chainConfig,
        tvlsData,
        auraGlobals,
        sdkChainName
      );

      const chainPools = activePools.map((pool, idx) => {
        const poolIndex = pool.poolIndex;
        const poolBalancerData = balancerData[poolIndex] || {
          apyBase: 0,
          underlyingTokens: [],
        };

        // Calculate reward APR and collect reward tokens from Aura subgraph only
        const { apyReward, rewardTokens } = (
          rewardsData[poolIndex] || []
        ).reduce(
          (acc, reward) => {
            acc.apyReward += reward.apr;
            if (reward.apr > 0 && reward.rewardToken) {
              acc.rewardTokens.push(reward.rewardToken);
            }
            return acc;
          },
          { apyReward: 0, rewardTokens: [] }
        );

        return {
          pool: `${pool.lptoken.toLowerCase()}-aura`,
          chain: chainConfig.llamaChainName,
          project: 'aura',
          symbol: utils.formatSymbol(symbolsData[idx] ?? 'Unknown'),
          tvlUsd: tvlsData[poolIndex] ?? 0,
          apyBase: poolBalancerData.apyBase,
          apyReward,
          rewardTokens: Array.from(new Set(rewardTokens || [])),
          underlyingTokens: poolBalancerData.underlyingTokens,
          poolMeta: null,
          url: `https://app.aura.finance/#/${chainConfig.chainId}/pool/${poolIndex}`,
        };
      });

      allPools.push(...chainPools);
    } catch (_err) {
      console.error(`Error processing ${chainName}:`, _err.message);
      // Skip chain on error
    }
  }

  return allPools;
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.aura.finance/',
};
