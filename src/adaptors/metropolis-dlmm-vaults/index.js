const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'sonic';
const PROJECT = 'metropolis-dlmm-vaults';
const VAULTS_API =
  'https://api-b.metropolis.exchange/api/v1/vaults?chainId=146';
const POOLS_API = 'https://api-b.metropolis.exchange/api/v1/pools?chainId=146';

async function apy() {
  const [{ data: vaults }, { data: pools }] = await Promise.all([
    axios.get(VAULTS_API),
    axios.get(POOLS_API),
  ]);

  // Build reward token lookup from pools (keyed by pool address)
  const rewardTokenMap = {};
  for (const pool of pools) {
    if (pool.rewardTokens?.length) {
      rewardTokenMap[pool.address.toLowerCase()] = pool.rewardTokens;
    }
  }

  return vaults
    .filter((v) => !v.isEmergencyMode && !v.isFlaggedForShutdown)
    .map((vault) => {
      const apyRewardRaw = (vault.rewardApr || 0) + (vault.extraRewardApr || 0);
      const pairRewardTokens = rewardTokenMap[vault.pairAddress?.toLowerCase()];
      const hasRewardTokens = pairRewardTokens?.length > 0;

      return {
        pool: `${vault.vaultAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${vault.tokenX.symbol}-${vault.tokenY.symbol}`,
        tvlUsd: vault.liquidityUSD || 0,
        apyBase:
          (vault.feeApr24 || 0) +
          (!hasRewardTokens && apyRewardRaw > 0 ? apyRewardRaw : 0),
        apyBase7d: vault.feeApr7d || 0,
        apyReward:
          hasRewardTokens && apyRewardRaw > 0 ? apyRewardRaw : undefined,
        rewardTokens:
          hasRewardTokens && apyRewardRaw > 0 ? pairRewardTokens : undefined,
        underlyingTokens: [vault.tokenX.id, vault.tokenY.id],
        poolMeta: vault.name || undefined,
        url: `https://app.metropolis.exchange/liquidity/vault/:146/add/${vault.vaultAddress}`,
      };
    })
    .filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.metropolis.exchange/makervault/list/:146',
};
