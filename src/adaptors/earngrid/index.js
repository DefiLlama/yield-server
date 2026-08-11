const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'base';

// EarnGrid BlendedVault on Base
const VAULT = '0x8694D7D44309665D51Cb5002fceC0454f1c233dE';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BVUSDC = '0x8694D7D44309665D51Cb5002fceC0454f1c233dE'; // vault itself = receipt token

// Underlying MetaMorpho strategies & their Morpho Blue vault addresses
const STRATEGIES = [
  {
    name: 'Gauntlet USDC Prime',
    morphoVault: '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61',
  },
  {
    name: 'Steakhouse Prime USDC',
    morphoVault: '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2',
  },
  {
    name: 'Moonwell Flagship USDC',
    morphoVault: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
  },
  {
    name: 'Gauntlet USDC Frontier',
    morphoVault: '0x236919F11ff9eA9550A4287696C2FC9e18E6e890',
  },
  {
    name: 'Steakhouse High Yield USDC v1.1',
    morphoVault: '0xBEEFA7B88064FeEF0cEe02AAeBBd95D30df3878F',
  },
];

/**
 * Fetch MetaMorpho vault APYs from Morpho Blue GraphQL.
 * Returns a map of vault address → netApy (as decimal, e.g. 0.05 = 5%).
 */
async function getMorphoApyMap() {
  const query = `
    query {
      vaults(where: {
        chainId_in: [8453],
        address_in: ${JSON.stringify(STRATEGIES.map((s) => s.morphoVault))}
      }, first: 10) {
        items {
          address
          state { netApy }
        }
      }
    }
  `;

  try {
    const resp = await utils.fetchURL('https://blue-api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const items = resp?.data?.vaults?.items ?? [];
    const map = {};
    for (const item of items) {
      map[item.address.toLowerCase()] = item.state?.netApy ?? 0;
    }
    return map;
  } catch (e) {
    console.error('EarnGrid: Morpho GraphQL failed, falling back to 0 APY', e.message);
    return {};
  }
}

const abiTotalAssets = 'function totalAssets() view returns (uint256)';
const abiBalanceOf = 'function balanceOf(address) view returns (uint256)';

const getApy = async () => {
  // 1. Fetch totalAssets from the vault
  const totalAssetsCall = sdk.api.abi.call({
    chain: CHAIN,
    target: VAULT,
    abi: abiTotalAssets,
  });

  // 2. Fetch vault's balance in each MetaMorpho strategy
  const strategyBalanceCalls = STRATEGIES.map((s) =>
    sdk.api.abi.call({
      chain: CHAIN,
      target: s.morphoVault,
      abi: abiBalanceOf,
      params: [VAULT],
    })
  );

  // 3. Fetch Morpho APY data
  const apyMapPromise = getMorphoApyMap();

  const [totalAssetsRes, ...balanceResults] = await Promise.all([
    totalAssetsCall,
    ...strategyBalanceCalls,
  ]);
  const apyMap = await apyMapPromise;

  const totalAssets = totalAssetsRes.output / 1e6; // USDC has 6 decimals
  const usdcPrice = 1; // stablecoin

  // Build strategy allocation + compute weighted APY
  let totalBalance = 0;
  const allocations = STRATEGIES.map((s, i) => {
    const bal = balanceResults[i].output / 1e6;
    totalBalance += bal;
    const apy = (apyMap[s.morphoVault.toLowerCase()] ?? 0) * 100; // decimal → percentage
    return { ...s, balance: bal, apy };
  });

  // Weighted average APY across all vault assets (idle USDC earns 0%)
  let weightedApy = 0;
  if (totalAssets > 0) {
    weightedApy = allocations.reduce((sum, a) => sum + a.balance * a.apy, 0) / totalAssets;
  }

  // Fallback: if GraphQL failed, estimate from totalAssets growth (rough)
  // For now, just report 0 if no data
  const apyBase = weightedApy > 0 ? weightedApy : 0;

  // Compute idle (unallocated) portion
  const idle = totalAssets - totalBalance;

  // Build pool output
  const pool = {
    pool: `${VAULT}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: 'earngrid',
    symbol: 'USDC',
    tvlUsd: totalAssets * usdcPrice,
    apyBase,
    apyReward: 0,
    underlyingTokens: [USDC],
    url: 'https://earngrid.site',
    poolMeta: idle > 0.01 ? `${allocations.filter((a) => a.balance > 0).length} strategies + idle` : `${allocations.filter((a) => a.balance > 0).length} strategies`,
  };

  return [pool];
};

module.exports = {
  protocolId: '8384',
  timetravel: false,
  apy: getApy,
  url: 'https://earngrid.site',
};
