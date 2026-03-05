const utils = require('../utils');

// Chain ID to DefiLlama chain name mapping
const chainIdToName = {
  42161: 'Arbitrum',
  8453: 'Base',
  81457: 'Blast',
  33139: 'ApeChain',
  999: 'Hyperliquid',
  3637: 'Botanix',
  80094: 'Berachain',
};

// Reward tokens by chain
const rewardTokens = {
  42161: ['0x912CE59144191C1204E64559FE8253a0e49E6548'], // ARB
  8453: [],
  81457: [],
  33139: ['0x48b62137EdfA95a428D35C09E44256a739F6B557'], // APE
  999: [],
  3637: [],
  80094: [],
};

// Token addresses
const aura = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF';
const usdc = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const glp = '0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf';

// Vault addresses
const jauraLsdVault = '0x7629fc134e5a7feBEf6340438D96881C8D121f2c';
const jusdcVault = '0xB0BDE111812EAC913b392D80D51966eC977bE3A2';
const jglpVault = '0x7241bC8035b65865156DDb5EdEf3eB32874a3AF6';

// tRPC input param (null address for public data)
const trpcInput = encodeURIComponent(
  JSON.stringify({
    json: { address: null },
    meta: { values: { address: ['undefined'] } },
  })
);

async function pools() {
  const [jauraRes, jusdcRes, jglpRes, smartLpRes] = await Promise.all([
    utils
      .getData(
        `https://app.jonesdao.io/api/trpc/compounderVaults.jaura.vault?input=${trpcInput}`
      )
      .catch(() => null),
    utils
      .getData(
        `https://app.jonesdao.io/api/trpc/leveragedVaults.jusdc.vault?input=${trpcInput}`
      )
      .catch(() => null),
    utils
      .getData(
        `https://app.jonesdao.io/api/trpc/leveragedVaults.jglp.vault?input=${trpcInput}`
      )
      .catch(() => null),
    utils.getData('https://app.jonesdao.io/api/smart-lp/pools').catch(() => ({
      strategies: [],
    })),
  ]);

  const pools = [];

  // jAURA vault (Ethereum - AURA staking)
  if (jauraRes?.result?.data?.json?.auraVault) {
    const auraVault = jauraRes.result.data.json.auraVault;

    // LSD Vault (main jAURA vault)
    if (auraVault.lsdVault && auraVault.lsdVault.tvl > 0) {
      pools.push({
        pool: `${jauraLsdVault}-ethereum`.toLowerCase(),
        chain: 'Ethereum',
        project: 'jones-dao',
        symbol: 'jAURA',
        underlyingTokens: [aura],
        tvlUsd: auraVault.lsdVault.tvl,
        apyBase: auraVault.lsdVault.apys?.total || 0,
        poolMeta: '2 week lock',
      });
    }
  }

  // jUSDC vault (Arbitrum)
  if (jusdcRes?.result?.data?.json?.jUsdcVault) {
    const vault = jusdcRes.result.data.json.jUsdcVault;
    if (vault.tvl > 0) {
      pools.push({
        pool: `${jusdcVault}-arbitrum`.toLowerCase(),
        chain: 'Arbitrum',
        project: 'jones-dao',
        symbol: 'jUSDC',
        underlyingTokens: [usdc],
        tvlUsd: vault.tvl,
        apyBase: vault.apy?.apy || 0,
        poolMeta: '1 day lock',
      });
    }
  }

  // jGLP vault (Arbitrum) - only include if TVL > 0
  if (jglpRes?.result?.data?.json?.leveragedVaults) {
    const vaults = jglpRes.result.data.json.leveragedVaults;
    for (const vault of vaults) {
      if (vault.tvl > 0) {
        pools.push({
          pool: `${jglpVault}-arbitrum`.toLowerCase(),
          chain: 'Arbitrum',
          project: 'jones-dao',
          symbol: 'jGLP',
          underlyingTokens: [glp],
          tvlUsd: vault.tvl,
          apyBase: vault.apy?.apy || 0,
        });
      }
    }
  }

  // Smart LP pools
  const strategies = smartLpRes.strategies || [];
  const smartLpPools = strategies
    .filter((strat) => chainIdToName[strat.chainId] && strat.tvl > 0)
    .map((strat) => {
      const chainName = chainIdToName[strat.chainId];
      const chainRewardTokens = rewardTokens[strat.chainId] || [];

      const totalRewardApr =
        (strat.stipApr ?? 0) + (strat.merklApr ?? 0) + (strat.camelotApr ?? 0);

      return {
        pool: `${strat.vaultAddress}-${chainName.toLowerCase()}`.toLowerCase(),
        chain: chainName,
        project: 'jones-dao',
        symbol: strat.poolName,
        underlyingTokens: [strat.token0.address, strat.token1.address],
        tvlUsd: strat.tvl,
        apyBase: strat.apy || 0,
        apyReward: totalRewardApr > 0 ? totalRewardApr : null,
        rewardTokens: totalRewardApr > 0 ? chainRewardTokens : [],
        poolMeta: `${strat.strategyName.toUpperCase()} strategy on ${strat.dex.toUpperCase()}`,
      };
    });

  return [...pools, ...smartLpPools];
}

module.exports = {
  timetravel: false,
  url: 'https://app.jonesdao.io/vaults',
  apy: pools,
};
