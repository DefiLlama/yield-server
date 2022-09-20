/**
 * Badger DAO supports a comprehensive API to understand protocol offerings and yields.
 *
 * Badger SDK is available should this project ever convert to proper typescript.
 * https://github.com/Badger-Finance/badger-sdk
 *
 * Badger API documentation is available via Swagger.
 * https://api.badger.com/docs
 *
 * Any issues or upgrades to yield server offerings please contact @hellojintao (twitter) or jintao#0713 (discord).
 */
const utils = require('../utils');

// utilize badger-sdk network object if typescript becomes available
// https://github.com/Badger-Finance/badger-sdk/blob/main/src/config/enums/network.enum.ts
const SUPPORTED_NETWORKS = [
  'ethereum',
  'polygon',
  'arbitrum',
  'binance-smart-chain',
  'fantom',
  'optimism',
];

// Vault Objects Definitions

// export interface VaultYieldSummary extends YieldSummary {
//   sources: YieldSource[];
// }

// export interface YieldSource {
//   name: string;
//   performance: YieldSummary;
//   boostable: boolean;
// }

// export interface YieldSummary {
//   baseYield: number;
//   grossYield: number;
//   minYield: number;
//   maxYield: number;
//   minGrossYield: number;
//   maxGrossYield: number;
// }

// export interface VaultDTOV3 extends VaultDTO {
//   address: string;
//   apr: VaultYieldSummary;
//   apy: VaultYieldSummary;
//   yieldProjection: VaultYieldProjectionV3;
// }

// export interface VaultYieldProjection {
//   harvestValue: number;
//   harvestApr: number;
//   harvestTokens: TokenRate[];
//   harvestPeriodApr: number;
//   harvestPeriodApy: number;
//   harvestPeriodSources: TokenRate[];
//   harvestPeriodSourcesApy: TokenRate[];
//   yieldValue: number;
//   yieldApr: number;
//   yieldTokens: TokenRate[];
//   yieldPeriodApr: number;
//   yieldPeriodSources: TokenRate[];
//   nonHarvestApr: number;
//   nonHarvestApy: number;
// }

// export interface VaultDTO {
//   asset: string;
//   available: number;
//   balance: number;
//   behavior: VaultBehavior;
//   boost: BoostConfig;
//   bouncer: BouncerType;
//   lastHarvest: number;
//   name: string;
//   pricePerFullShare: number;
//   protocol: Protocol;
//   state: VaultState;
//   strategy: VaultStrategy;
//   tokens: TokenValue[];
//   type: VaultType;
//   underlyingToken: string;
//   value: number;
//   vaultAsset: string;
//   vaultToken: string;
//   version: VaultVersion;
// }

const project = 'badger-dao';

const influenceVaults = ['0xba485b556399123261a5f9c95d413b4f93107407'];

async function queryVaults(chain) {
  try {
    const url = `https://api.badger.com/v3/vaults/list?chain=${chain}`;
    const data = await utils.getData(url);

    let chainName = chain;
    if (chain === 'binance-smart-chain') {
      chain = 'bsc';
    }

    return data.map((e) => {
      const {
        apr: { sources },
        yieldProjection: { harvestApr, harvestTokens, nonHarvestApr },
        tokens,
        protocol,
        value: tvlUsd,
        vaultToken: pool,
      } = e;

      let apyBase = e.apy.baseYield;
      let apyReward = sources
        .filter((s) => s.name.includes('Badger Rewards'))
        .reduce((total, s) => (total += s.performance.baseYield), 0);

      if (e.version === 'v1.5' && !influenceVaults.includes(pool)) {
        apyBase = harvestApr;
        apyReward = nonHarvestApr;
      }

      const rewardTokens = harvestTokens.map((h) => h.address);
      const underlyingTokens = tokens.map((t) => t.address);

      return {
        pool,
        chain: utils.formatChain(chain),
        project,
        symbol: utils.formatSymbol(e.name),
        tvlUsd,
        apyBase,
        apyReward,
        rewardTokens,
        underlyingTokens,
      };
    });
  } catch (e) {
    if (e.message.includes('Internal Server Error')) {
      return [];
    } else {
      throw e;
    }
  }
}

const main = async () => {
  const data = await Promise.all(SUPPORTED_NETWORKS.map((n) => queryVaults(n)));
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.badger.com',
};
