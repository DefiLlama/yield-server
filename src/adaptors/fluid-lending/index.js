const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Constants
const CONSTANTS = {
  CHAIN_ID_MAPPING: {
    ethereum: 1,
    arbitrum: 42161,
    base: 8453,
    polygon: 137,
  },
  SUPPORTED_CHAINS: ['ethereum', 'arbitrum', 'base', 'polygon'],
  RESOLVERS: {
    LENDING: {
      ethereum: '0xC215485C572365AE87f908ad35233EC2572A3BEC',
      arbitrum: '0xdF4d3272FfAE8036d9a2E1626Df2Db5863b4b302',
      base: '0x3aF6FBEc4a2FE517F56E402C65e3f4c3e18C1D86',
      polygon: '0x8e72291D5e6f4AAB552cc827fB857a931Fc5CAC1',
    },
    VAULT: {
      ethereum: '0x814c8C7ceb1411B364c2940c4b9380e739e06686',
      arbitrum: '0xD7D455d387d7840F56C65Bb08aD639DE9244E463',
      base: '0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8',
      polygon: '0x9edb8D8b6db9A869c3bd913E44fa416Ca7490aCA',
    },
  },
};

// Import ABIs
const abiLendingResolver = require('./abiLendingResolver');
const abiVaultResolver = require('./abiVaultResolver');

// Lending Functions
const getLendingApy = async (chain) => {
  try {
    const fTokensEntireData = (
      await sdk.api.abi.call({
        target: CONSTANTS.RESOLVERS.LENDING[chain],
        abi: abiLendingResolver.find((m) => m.name === 'getFTokensEntireData'),
        chain,
      })
    ).output;

    const underlying = fTokensEntireData.map((d) => d.asset);

    const [symbol, decimals] = await Promise.all([
      sdk.api.abi.multiCall({
        calls: underlying.map((t) => ({ target: t })),
        abi: 'erc20:symbol',
        chain,
      }),
      sdk.api.abi.multiCall({
        calls: underlying.map((t) => ({ target: t })),
        abi: 'erc20:decimals',
        chain,
      }),
    ]);

    const priceKeys = underlying.map((i) => `${chain}:${i}`).join(',');
    const prices = (
      await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
    ).data.coins;

    const merkleRewardsTokens = (await axios.get(`https://api.fluid.instadapp.io/${CONSTANTS.CHAIN_ID_MAPPING[chain]}/tokens`)).data.data;

    return fTokensEntireData
      .map((token, i) => ({
        project: 'fluid-lending',
        pool: `${chain}_${token.tokenAddress}`,
        tvlUsd:
          (token.totalAssets * prices[`${chain}:${underlying[i]}`].price) /
          10 ** decimals.output[i].output,
        symbol: symbol.output[i].output,
        underlyingTokens: [token.asset],
        rewardTokens: [
          token.asset,
          ...merkleRewardsTokens
            .find(t => t.address.toLowerCase() === token.tokenAddress.toLowerCase())
            ?.rewards?.map(reward => reward?.token?.address) || []
        ],
        chain,
        apyBase: Number((token.supplyRate / 1e2).toFixed(2)),
        apyReward: (() => {
          const nativeRewardsRate = Number((token.rewardsRate / 1e12).toFixed(2));
          const fTokenMerkleData = merkleRewardsTokens.find(t => t.address.toLowerCase() === token.tokenAddress.toLowerCase());
          if (!fTokenMerkleData || !fTokenMerkleData.rewards || fTokenMerkleData.rewards.length === 0) {
            return nativeRewardsRate;
          }
          const merkleRewardsSum = fTokenMerkleData.rewards.reduce((sum, reward) => sum + (reward.rate / 1e2), 0);
          return Number((nativeRewardsRate + merkleRewardsSum).toFixed(2));
        })(),
        url: `https://fluid.io/lending/${CONSTANTS.CHAIN_ID_MAPPING[chain]}/${symbol.output[i].output}`,
      }))
      .filter((i) => utils.keepFinite(i));
  } catch (error) {
    console.error(`Error fetching lending APY for ${chain}:`, error);
    return [];
  }
};

// Vault Functions
const getVaultApy = async (chain) => {
  try {
    let vaultsEntireData = (
      await sdk.api.abi.call({
        target: CONSTANTS.RESOLVERS.VAULT[chain],
        abi: abiVaultResolver.find((m) => m.name === 'getVaultsEntireData'),
        chain,
      })
    ).output;

    vaultsEntireData = vaultsEntireData.map((vault, index) => ({
      ...vault,
      VaultId: index + 1,
    }));

    const filteredVaults = vaultsEntireData.filter(
      (vault) => vault[1] === false && vault[2] === false
    );

    const vaultDetails = {
      pools: filteredVaults.map((vault) => vault[0]),
      underlyingTokens: filteredVaults.map((vault) => [
        normalizeAddress(vault[3][8][0]),
        normalizeAddress(vault[3][9][0]),
      ]),
      rewardsRates: filteredVaults.map((vault) => Math.max(0, vault[5][12])),
      rewardsRatesBorrow: filteredVaults.map((vault) =>
        Math.max(0, vault[5][13])
      ),
      supplyRates: filteredVaults.map((vault) => Math.max(0, vault[5][8])),
      supplyRatesBorrow: filteredVaults.map((vault) =>
        Math.max(0, vault[5][9])
      ),
      suppliedTokens: filteredVaults.map((vault) => vault[8][5]),
      borrowedTokens: filteredVaults.map((vault) => vault[8][4]),
      supplyTokens: filteredVaults.map((vault) =>
        normalizeAddress(vault[3][8][0])
      ),
      borrowTokens: filteredVaults.map((vault) =>
        normalizeAddress(vault[3][9][0])
      ),
      ltv: filteredVaults.map((vault) => normalizeAddress(vault[4][2])),
    };

    const tokenData = await fetchTokenData(chain, vaultDetails);

    return calculateVaultPoolData(
      chain,
      filteredVaults,
      vaultDetails,
      tokenData
    ).filter((pool) => utils.keepFinite(pool));
  } catch (error) {
    console.error(`Error fetching vault APY for ${chain}:`, error);
    return [];
  }
};

// Helper Functions
const normalizeAddress = (address) => {
  const lowercaseAddress = String(address).toLowerCase();
  return lowercaseAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    ? '0x0000000000000000000000000000000000000000'
    : lowercaseAddress;
};

const fetchTokenData = async (chain, vaultDetails) => {
  const priceKeys = vaultDetails.supplyTokens
    .map((token) => `${chain}:${token}`)
    .join(',');
  const borrowPriceKeys = vaultDetails.underlyingTokens
    .map((tokens) => `${chain}:${tokens[1]}`)
    .join(',');

  const [prices, borrowPrices] = await Promise.all([
    axios
      .get(`https://coins.llama.fi/prices/current/${priceKeys}`)
      .then((r) => r.data.coins),
    axios
      .get(`https://coins.llama.fi/prices/current/${borrowPriceKeys}`)
      .then((r) => r.data.coins),
  ]);

  return {
    symbol: vaultDetails.underlyingTokens.map(
      (tokens) =>
        `${prices[`${chain}:${tokens[0]}`].symbol}/${
          borrowPrices[`${chain}:${tokens[1]}`].symbol
        }`
    ),
    decimals: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`].decimals
    ),
    borrowTokenDecimals: vaultDetails.borrowTokens.map(
      (token) => borrowPrices[`${chain}:${token}`].decimals
    ),
    prices: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`].price
    ),
    borrowTokenPrices: vaultDetails.borrowTokens.map(
      (token) => borrowPrices[`${chain}:${token}`].price
    ),
  };
};

const calculateVaultPoolData = (
  chain,
  filteredVaults,
  vaultDetails,
  tokenData
) => {
  const totalSupplyUsd = vaultDetails.suppliedTokens.map(
    (suppliedToken, index) =>
      (suppliedToken * tokenData.prices[index]) /
      10 ** tokenData.decimals[index]
  );
  const totalBorrowUsd = vaultDetails.borrowedTokens.map(
    (borrowedToken, index) =>
      (borrowedToken * tokenData.borrowTokenPrices[index]) /
      10 ** tokenData.borrowTokenDecimals[index]
  );

  return filteredVaults.map((vault, index) => {
    const s = tokenData.symbol[index].replace('.base', '').split('/');
    const supplySymbol = s[0];
    const borrowSymbol = s[1];
    return {
      project: 'fluid-lending',
      pool: `${chain}_${vaultDetails.pools[index]}`,
      tvlUsd: totalSupplyUsd[index],
      totalSupplyUsd: totalSupplyUsd[index],
      totalBorrowUsd: totalBorrowUsd[index],
      symbol: supplySymbol,
      underlyingTokens: vaultDetails.underlyingTokens[index],
      rewardTokens: vaultDetails.underlyingTokens[index],
      chain,
      apyBase: Number((vaultDetails.supplyRates[index] / 1e2).toFixed(2)),
      apyBaseBorrow: Number(
        (vaultDetails.supplyRatesBorrow[index] / 1e2).toFixed(2)
      ),
      apyReward: Number((vaultDetails.rewardsRates[index] / 1e12).toFixed(2)),
      apyRewardBorrow: Number(
        (vaultDetails.rewardsRatesBorrow[index] / 1e12).toFixed(2)
      ),
      ltv: vaultDetails.ltv[index] / 1e4,
      mintedCoin: borrowSymbol,
      url: `https://fluid.io/vaults/${CONSTANTS.CHAIN_ID_MAPPING[chain]}/${vault.VaultId}`,
    };
  });
};

// Main Function
const apy = async () => {
  const [lendingData, vaultData] = await Promise.all([
    Promise.all(CONSTANTS.SUPPORTED_CHAINS.map(getLendingApy)),
    Promise.all(CONSTANTS.SUPPORTED_CHAINS.map(getVaultApy)),
  ]);
  // Combine and flatten both arrays
  return [...lendingData.flat(), ...vaultData.flat()];
};

module.exports = {
  apy,
};
// test: npm run test --adapter=fluid-lending
