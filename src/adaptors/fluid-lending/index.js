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
    plasma: 9745,
  },
  SUPPORTED_CHAINS: ['ethereum', 'arbitrum', 'base', 'polygon', 'plasma'],
  RESOLVERS: {
    LENDING: {
      ethereum: '0xC215485C572365AE87f908ad35233EC2572A3BEC',
      arbitrum: '0xdF4d3272FfAE8036d9a2E1626Df2Db5863b4b302',
      base: '0x3aF6FBEc4a2FE517F56E402C65e3f4c3e18C1D86',
      polygon: '0x8e72291D5e6f4AAB552cc827fB857a931Fc5CAC1',
      plasma: '0xfbb7005c49520a4E54746487f0b28F4E4594b293',
    },
    VAULT: {
      ethereum: '0x814c8C7ceb1411B364c2940c4b9380e739e06686',
      arbitrum: '0xD7D455d387d7840F56C65Bb08aD639DE9244E463',
      base: '0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8',
      polygon: '0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC',
      plasma: '0x5471195328cB443c85097A7A7fF0A74eaB3Cb497',
    },
  },
  FLUID_TOKEN: {
    ethereum: '0x6f40d4a6237c257fff2db00fa0510deeecd303eb',
    arbitrum: '0x61e030a56d33e8260fdd81f03b162a79fe3449cd',
    base: '0x61e030a56d33e8260fdd81f03b162a79fe3449cd',
  },
};

// Import ABIs
const abiLendingResolver = require('./abiLendingResolver');
const abiVaultResolver = require('./abiVaultResolver');
const getVaultsEntireDataAbi = abiVaultResolver.find(
  (m) => m.name === 'getVaultsEntireData'
);
const getAllVaultsAddressesAbi = {
  inputs: [],
  name: 'getAllVaultsAddresses',
  outputs: [{ internalType: 'address[]', name: 'vaults_', type: 'address[]' }],
  stateMutability: 'view',
  type: 'function',
};
const getVaultsEntireDataByAddressAbi = JSON.parse(
  JSON.stringify(getVaultsEntireDataAbi)
);
getVaultsEntireDataByAddressAbi.inputs = [
  { internalType: 'address[]', name: 'vaults_', type: 'address[]' },
];
// Polygon's current resolver uses the address[] overload and includes these fields.
getVaultsEntireDataByAddressAbi.outputs[0].components[9].components.push(
  { internalType: 'uint256', name: 'decayEndTimestamp', type: 'uint256' },
  { internalType: 'uint256', name: 'decayAmount', type: 'uint256' }
);
const readFromStorageAbi = {
  inputs: [{ internalType: 'bytes32', name: 'slot_', type: 'bytes32' }],
  name: 'readFromStorage',
  outputs: [{ internalType: 'uint256', name: 'result_', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const USER_BORROW_IS_PAUSED = 1n << 255n;

// Lending Functions
const getLendingApy = async (chain) => {
  try {
    let fTokensEntireData = (
      await sdk.api.abi.call({
        target: CONSTANTS.RESOLVERS.LENDING[chain],
        abi: abiLendingResolver.find((m) => m.name === 'getFTokensEntireData'),
        chain,
      })
    ).output;

    const merkleRewardsTokens = (await axios.get(`https://api.fluid.instadapp.io/${CONSTANTS.CHAIN_ID_MAPPING[chain]}/tokens`)).data.data;
    fTokensEntireData = fTokensEntireData.filter((token) =>
      merkleRewardsTokens.some(
        (t) => t.address.toLowerCase() === token.tokenAddress.toLowerCase()
      )
    );

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
    const prices = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;

    return fTokensEntireData
      .map((token, i) => {
        const fTokenMerkleData = merkleRewardsTokens.find(
          (t) => t.address.toLowerCase() === token.tokenAddress.toLowerCase()
        );
        const merkleTokens =
          fTokenMerkleData?.rewards
            ?.map((r) => r?.token?.address)
            .filter(Boolean) || [];
        const merkleRewardsSum =
          fTokenMerkleData?.rewards?.reduce(
            (sum, r) => sum + (r.rate / 1e2),
            0
          ) || 0;
        const nativeRewardsRate = Number(token.rewardsRate) / 1e12;
        const apyReward = Number(
          (nativeRewardsRate + merkleRewardsSum).toFixed(2)
        );
        return {
          project: 'fluid-lending',
          pool: `${chain}_${token.tokenAddress}`,
          tvlUsd:
            (token.totalAssets * prices[`${chain}:${underlying[i]}`].price) /
            10 ** decimals.output[i].output,
          symbol: symbol.output[i].output,
          underlyingTokens: [token.asset],
          chain,
          apyBase: Number((token.supplyRate / 1e2).toFixed(2)),
          ...(apyReward > 0 && merkleTokens.length > 0 && {
            apyReward,
            rewardTokens: merkleTokens,
          }),
          url: `https://fluid.io/lending/${CONSTANTS.CHAIN_ID_MAPPING[chain]}/${symbol.output[i].output}`,
        };
      })
      .filter((i) => utils.keepFinite(i));
  } catch (error) {
    console.error(`Error fetching lending APY for ${chain}:`, error);
    return [];
  }
};

// Vault Functions
const getVaultApy = async (chain) => {
  try {
    const vaults =
      chain === 'polygon'
        ? (
            await sdk.api.abi.call({
              target: CONSTANTS.RESOLVERS.VAULT[chain],
              abi: getAllVaultsAddressesAbi,
              chain,
            })
          ).output
        : undefined;

    let vaultsEntireData = (
      await sdk.api.abi.call({
        target: CONSTANTS.RESOLVERS.VAULT[chain],
        abi:
          chain === 'polygon'
            ? getVaultsEntireDataByAddressAbi
            : getVaultsEntireDataAbi,
        ...(vaults && { params: [vaults] }),
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

    const userBorrowData = await sdk.api.abi.multiCall({
      calls: filteredVaults.map((vault) => ({
        target: vault[3][7],
        params: [vault[3][15]],
      })),
      abi: readFromStorageAbi,
      chain,
    });

    const vaultDetails = {
      pools: filteredVaults.map((vault) => vault[0]),
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
      borrowableTokens: filteredVaults.map((vault) => vault[7][5]),
      borrowPaused: userBorrowData.output.map(
        ({ output }) => (BigInt(output) & USER_BORROW_IS_PAUSED) !== 0n
      ),
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
    ).filter(
      (pool) =>
        utils.keepFinite(pool) &&
        Number.isFinite(pool.totalSupplyUsd) &&
        Number.isFinite(pool.totalBorrowUsd) &&
        Number.isFinite(pool.availableBorrowUsd)
    );
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
  const borrowPriceKeys = vaultDetails.borrowTokens
    .map((token) => `${chain}:${token}`)
    .join(',');

  const [prices, borrowPrices] = await Promise.all([
    axios
      .get(utils.getPriceApiUrl(`/prices/current/${priceKeys}`))
      .then((r) => r.data.coins),
    axios
      .get(utils.getPriceApiUrl(`/prices/current/${borrowPriceKeys}`))
      .then((r) => r.data.coins),
  ]);

  return {
    symbol: vaultDetails.supplyTokens.map(
      (token, index) =>
        `${prices[`${chain}:${token}`]?.symbol}/${
          borrowPrices[`${chain}:${vaultDetails.borrowTokens[index]}`]?.symbol
        }`
    ),
    decimals: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`]?.decimals
    ),
    borrowTokenDecimals: vaultDetails.borrowTokens.map(
      (token) => borrowPrices[`${chain}:${token}`]?.decimals
    ),
    prices: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`]?.price
    ),
    borrowTokenPrices: vaultDetails.borrowTokens.map(
      (token) => borrowPrices[`${chain}:${token}`]?.price
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
  // Fluid vaults borrow from the shared Liquidity layer, so this is not
  // capped by vault TVL alone; the resolver value already includes borrow
  // limits, max utilization, and available debt-token balance.
  const availableBorrowUsd = vaultDetails.borrowableTokens.map(
    (borrowableToken, index) =>
      (borrowableToken * tokenData.borrowTokenPrices[index]) /
      10 ** tokenData.borrowTokenDecimals[index]
  );

  const fluidToken = CONSTANTS.FLUID_TOKEN[chain];

  return filteredVaults.map((vault, index) => {
    const s = tokenData.symbol[index].replace('.base', '').split('/');
    const supplySymbol = s[0];
    const borrowSymbol = s[1];
    const apyReward = Number((vaultDetails.rewardsRates[index] / 1e12).toFixed(2));
    const apyRewardBorrow = Number(
      (vaultDetails.rewardsRatesBorrow[index] / 1e12).toFixed(2)
    );
    const hasReward = (apyReward > 0 || apyRewardBorrow > 0) && Boolean(fluidToken);
    return {
      project: 'fluid-lending',
      pool: `${chain}_${vaultDetails.pools[index]}`,
      tvlUsd: totalSupplyUsd[index],
      totalSupplyUsd: totalSupplyUsd[index],
      totalBorrowUsd: totalBorrowUsd[index],
      availableBorrowUsd: availableBorrowUsd[index],
      symbol: supplySymbol,
      underlyingTokens: [vaultDetails.supplyTokens[index]],
      chain,
      apyBase: Number((vaultDetails.supplyRates[index] / 1e2).toFixed(2)),
      apyBaseBorrow: Number(
        (vaultDetails.supplyRatesBorrow[index] / 1e2).toFixed(2)
      ),
      ...(hasReward && {
        apyReward,
        apyRewardBorrow,
        rewardTokens: [fluidToken],
      }),
      ltv: vaultDetails.ltv[index] / 1e4,
      mintedCoin: borrowSymbol,
      borrowToken: vaultDetails.borrowTokens[index],
      borrowable:
        !vaultDetails.borrowPaused[index],
      borrowMarketOnly: true,
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
  protocolId: '4167',
  apy,
};
// test: npm run test --adapter=fluid-lending
