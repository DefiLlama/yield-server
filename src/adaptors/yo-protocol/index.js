const axios = require('axios');
const { formatChain, getPrices, getERC4626Info } = require('../utils');
const { getVaultReward } = require('./services');

const PROJECT_NAME = 'yo-protocol';
const API_URL = 'https://api.yo.xyz/api/v1/vault/stats?secondary=true';
const SOLANA_API_URL = 'https://api.yo.xyz/api/v1/solana/vault/stats';
const MERKL_API_URL =
  'https://api.merkl.fr/v4/campaigns?creatorAddress=0x8C9200d94Cf7A1B201068c4deDa6239F15FED480&status=LIVE&withOpportunity=true';

const getEvmPools = async () => {
  const response = await axios.get(API_URL);
  const vaults = response.data.data;

  // Fetch prices per chain to avoid address collisions across chains
  const chainGroups = {};
  for (const vault of vaults) {
    if (!chainGroups[vault.chain.name]) chainGroups[vault.chain.name] = new Set();
    chainGroups[vault.chain.name].add(vault.asset.address);
  }

  const pricesByKey = {};
  const priceResults = await Promise.allSettled(
    Object.entries(chainGroups).map(async ([chain, addresses]) => {
      const { pricesByAddress } = await getPrices([...addresses], chain);
      return { chain, pricesByAddress };
    })
  );
  for (const result of priceResults) {
    if (result.status !== 'fulfilled') continue;
    const { chain, pricesByAddress } = result.value;
    for (const [address, price] of Object.entries(pricesByAddress)) {
      pricesByKey[`${chain}:${address}`.toLowerCase()] = price;
    }
  }

  const tvls = await Promise.allSettled(
    vaults.map((vault) =>
      getERC4626Info(
        vault.contracts.vaultAddress.toLowerCase(),
        vault.chain.name
      )
    )
  );

  const tvlByKey = {};
  tvls.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const vault = vaults[i];
      const key =
        `${vault.contracts.vaultAddress}-${vault.chain.name}`.toLowerCase();
      tvlByKey[key] = result.value.tvl;
    }
  });

  // Fetch vault rewards from Merkl — keyed by vault address (not chain)
  // so all chains for the same vault share the reward APY
  let vaultRewardMap;
  try {
    vaultRewardMap = await getVaultReward(MERKL_API_URL);
  } catch {
    vaultRewardMap = new Map();
  }

  const pools = [];
  for (const vault of vaults) {
    const key =
      `${vault.contracts.vaultAddress}-${vault.chain.name}`.toLowerCase();

    const price =
      pricesByKey[`${vault.chain.name}:${vault.asset.address}`.toLowerCase()];
    if (tvlByKey[key] == null || price == null) continue;

    const normalizedTvl =
      tvlByKey[key] / 10 ** vault.asset.decimals;

    const tvlUsd = normalizedTvl * Number(price);

    const vaultReward = vaultRewardMap.get(
      vault.contracts.vaultAddress.toLowerCase()
    );

    // Preserve original pool IDs for existing primary pools to avoid losing historical data
    const poolId = vault.type === 'Deposit'
      ? vault.contracts.vaultAddress
      : key;

    const pool = {
      pool: poolId,
      chain: formatChain(vault.chain.name),
      poolMeta: vault.name,
      project: PROJECT_NAME,
      symbol: vault.asset.symbol,
      tvlUsd: tvlUsd,
      apyBase: Number(vault.yield['1d']),
      underlyingTokens: [vault.asset.address],
      url: `https://app.yo.xyz/vault/${vault.chain.name}/${vault.contracts.vaultAddress}`,
      ...(vaultReward && {
        apyReward: Number(vaultReward.apr),
        rewardTokens: ['0x1925450f5e5fb974b0aae1f3408cf5286fbd1a72'],
      }),
    };

    pools.push(pool);
  }

  return pools;
};

const getSolanaPools = async () => {
  const response = await axios.get(SOLANA_API_URL);
  const vaults = response.data.data;

  if (!vaults || !vaults.length) return [];

  // Fetch prices for Solana assets via DefiLlama
  const assetAddresses = [...new Set(vaults.map((v) => v.asset.address))];
  const { pricesByAddress } = await getPrices(assetAddresses, 'solana');

  const pools = [];
  for (const vault of vaults) {
    const price = pricesByAddress[vault.asset.address.toLowerCase()];
    if (price == null) continue;

    const tvlRaw = vault.tvl?.raw;
    if (tvlRaw == null) continue;

    const normalizedTvl = Number(tvlRaw) / 10 ** vault.asset.decimals;
    const tvlUsd = normalizedTvl * Number(price);

    const apyBase = vault.yield?.['1d'] != null ? Number(vault.yield['1d']) : null;
    const rewardYield = vault.rewardYield != null ? Number(vault.rewardYield) : null;

    const shareTokenAddress = vault.shareAsset?.address || vault.contracts.vaultAddress;
    const pool = {
      pool: vault.contracts.vaultAddress,
      chain: formatChain('Solana'),
      poolMeta: vault.name,
      project: PROJECT_NAME,
      symbol: vault.asset.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [vault.asset.address],
      token: shareTokenAddress,
      url: `https://app.yo.xyz/vault/Solana/${vault.id.toLowerCase()}`,
      ...(rewardYield && rewardYield > 0 && {
        apyReward: rewardYield,
        rewardTokens: ['0x1925450f5e5fb974b0aae1f3408cf5286fbd1a72'],
      }),
    };

    pools.push(pool);
  }

  return pools;
};

const apy = async () => {
  const [evmPools, solanaPools] = await Promise.all([
    getEvmPools(),
    getSolanaPools().catch(() => []),
  ]);

  return [...evmPools, ...solanaPools];
};

module.exports = { apy };
