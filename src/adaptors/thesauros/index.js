const sdk = require('@defillama/sdk');
const { formatChain, getERC4626Info, getPrices } = require('../utils');

// Thesauros ERC4626 vaults. Each vault allocates its assets across a set of
// yield providers (Aave v3, Compound v3, Morpho vaults, ...). v1 vaults were
// superseded by v2 vaults in August 2026 (users migrated on 2026-09-09) but
// are kept so the remaining dust is still tracked.
const VAULTS = [
  // v1
  {
    chain: 'arbitrum',
    address: '0x57C10bd3fdB2849384dDe954f63d37DfAD9d7d70',
    symbol: 'USDC',
    asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
  },
  {
    chain: 'arbitrum',
    address: '0xcd72118C0707D315fa13350a63596dCd9B294A30',
    symbol: 'USDT',
    asset: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    decimals: 6,
  },
  {
    chain: 'base',
    address: '0x6C7013b3596623d146781c90b4Ee182331Af6148',
    symbol: 'USDC',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  },
  // v2
  {
    chain: 'arbitrum',
    address: '0x4E5c0A4C11d713002D74bA43a458efc31bc76378',
    symbol: 'USDC',
    asset: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
  },
  {
    chain: 'base',
    address: '0x3C7739173cca612B6394EE57131458185A5beC44',
    symbol: 'USDC',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  },
  {
    chain: 'plasma',
    address: '0x2Ed9B7fB6Bbe0920145B2a79c18C3f7cFCAE3C99',
    symbol: 'USDT0',
    asset: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    decimals: 6,
  },
  {
    chain: 'monad',
    address: '0x40F1fBf6a92155a6D321c09936234BFEb9Ec4760',
    symbol: 'USDC',
    asset: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    decimals: 6,
  },
];

const abi = {
  getProviders: 'address[]:getProviders',
  // rate in ray (1e27)
  getDepositRate: 'function getDepositRate(address vault) view returns (uint256)',
  getDepositBalance:
    'function getDepositBalance(address user, address vault) view returns (uint256)',
};

const RAY = 1e27;

// Balance-weighted deposit rate across all providers the vault is allocated to.
const getVaultApy = async (vault, chain) => {
  const providers = (
    await sdk.api.abi.call({ target: vault, abi: abi.getProviders, chain })
  ).output;

  const [rates, balances] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abi.getDepositRate,
      calls: providers.map((target) => ({ target, params: [vault] })),
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: abi.getDepositBalance,
      calls: providers.map((target) => ({ target, params: [vault, vault] })),
      chain,
      permitFailure: true,
    }),
  ]).then((res) => res.map(({ output }) => output.map((o) => o.output)));

  let totalBalance = 0;
  let weightedRate = 0;
  providers.forEach((_, i) => {
    const balance = Number(balances[i] ?? 0);
    const rate = Number(rates[i] ?? 0);
    totalBalance += balance;
    weightedRate += balance * rate;
  });

  if (totalBalance === 0) return 0;
  return (weightedRate / totalBalance / RAY) * 100;
};

const apy = async () => {
  const pools = [];

  for (const vault of VAULTS) {
    const { chain, address, symbol, asset, decimals } = vault;
    try {
      const erc4626Info = await getERC4626Info(address.toLowerCase(), chain, undefined, {
        assetUnit: '1' + '0'.repeat(decimals),
      });
      if (!erc4626Info || !erc4626Info.tvl) continue;

      const prices = await getPrices([asset], chain);
      const assetPrice = prices.pricesByAddress?.[asset.toLowerCase()] || 1;
      const tvlUsd = (erc4626Info.tvl / 10 ** decimals) * assetPrice;

      const apyBase = await getVaultApy(address, chain);

      pools.push({
        pool: `${address}-${chain}`.toLowerCase(),
        chain: formatChain(chain),
        project: 'thesauros',
        symbol,
        tvlUsd,
        apyBase,
        pricePerShare: erc4626Info.pricePerShare,
        underlyingTokens: [asset],
        poolMeta: 'Instant withdraw | Points Incentive',
        url: `https://app.thesauros.io/vault/${address}`,
      });
    } catch (error) {
      console.error(`Error processing vault ${address} on ${chain}:`, error.message);
    }
  }

  return pools.filter((p) => p.tvlUsd > 0);
};

module.exports = {
  protocolId: '7111',
  timetravel: false,
  apy,
};
