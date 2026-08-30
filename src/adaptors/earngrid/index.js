const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'base';

// EarnGrid BlendedVault v2.0.0 on Base (v1.0.4 0x8694D7D4… retired 2026-08-15)
const VAULT = '0xbDacA8B7782C66cc0ee32Cf70F835EBe86cb20D3';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BVUSDC = '0xbDacA8B7782C66cc0ee32Cf70F835EBe86cb20D3'; // vault itself = receipt token

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
    const resp = await utils.getData(
      'https://blue-api.morpho.org/graphql',
      { query },
      { 'Content-Type': 'application/json' }
    );

    const items = resp?.data?.vaults?.items ?? [];
    const map = {};
    for (const item of items) {
      map[item.address.toLowerCase()] = item.state?.netApy ?? 0;
    }
    return map;
  } catch (e) {
    console.error('EarnGrid: Morpho GraphQL failed, falling back to 0 APY', String(e));
    return {};
  }
}

const abiTotalAssets = 'function totalAssets() view returns (uint256)';
const abiBalanceOf = 'function balanceOf(address) view returns (uint256)';
const abiTotalSupply = 'erc20:totalSupply';

const getApy = async () => {
  // 1. Fetch totalAssets & totalSupply from the vault
  const totalAssetsCall = sdk.api.abi.call({
    chain: CHAIN,
    target: VAULT,
    abi: abiTotalAssets,
  });

  const totalSupplyCall = sdk.api.abi.call({
    chain: CHAIN,
    target: BVUSDC,
    abi: abiTotalSupply,
  });

  // 2. Fetch vault's balance in each MetaMorpho strategy (graceful: 0 on error)
  const strategyBalanceCalls = STRATEGIES.map((s) =>
    sdk.api.abi.call({
      chain: CHAIN,
      target: s.morphoVault,
      abi: abiBalanceOf,
      params: [VAULT],
    }).catch(() => ({ output: '0' }))
  );

  // 3. Fetch Morpho APY data + USDC price
  const apyMapPromise = getMorphoApyMap();
  const pricesPromise = utils.getPrices([USDC], CHAIN);

  const [totalAssetsRes, totalSupplyRes, ...balanceResults] = await Promise.all([
    totalAssetsCall,
    totalSupplyCall,
    ...strategyBalanceCalls,
  ]);
  const [apyMap, { pricesByAddress }] = await Promise.all([
    apyMapPromise,
    pricesPromise,
  ]);

  const totalAssets = Number(totalAssetsRes.output) / 1e6;
  const totalSupply = Number(totalSupplyRes.output) / 1e12; // bvUSDC shares: 12 decimals
  const usdcPrice = pricesByAddress[USDC.toLowerCase()] || 1;

  // Build strategy allocation + compute weighted APY
  let totalBalance = 0;
  const allocations = STRATEGIES.map((s, i) => {
    const bal = balanceResults[i].output / 1e18; // MetaMorpho shares: 18 decimals
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

  // Compute pricePerShare (ERC-4626 convertToAssets rate)
  const pricePerShare = totalSupply > 0 ? totalAssets / totalSupply : 1;

  const activeStrategyCount = allocations.filter((a) => a.balance > 0).length;

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
    poolMeta: idle > 0.01
      ? `${activeStrategyCount} strategies + idle`
      : `${activeStrategyCount} strategies`,
    token: BVUSDC,
    pricePerShare,
  };

  return [pool];
};

module.exports = {
  protocolId: '8384',
  timetravel: false,
  apy: getApy,
  url: 'https://earngrid.site',
};
