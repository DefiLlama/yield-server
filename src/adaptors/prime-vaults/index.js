const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const analyticsApiUrl = 'https://api.primevaults.finance/api/analytics/vaults';

const vaults = [
  {
    name: 'PrimeUSD Vault',
    symbol: 'PrimeUSD',
    vault: '0xf4e20b420482f8bed60ddc4836890b3c4ecfd3e5',
    accountant: '0xd0E9563E2e77a3655Fa765c9aFA51d7898DCce1B',
    chain: 'berachain',
    decimals: 6,
    rewardTokens: [
      '0x549943e04f40284185054145c6e4e9568c1d3241', // USDC.e
      '0x779ded0c9e1022225f8e0630b35a9b54be713736', // USDT0
    ],
    underlyingTokens: [
      '0x549943e04f40284185054145c6e4e9568c1d3241', // USDC.e
    ],
    url: 'https://app.primevaults.finance/vault-details/0xF4e20B420482F8bEd60DDc4836890b3c4eCFD3E5',
  },
  {
    name: 'PrimeETH Vault',
    symbol: 'PrimeETH',
    vault: '0xccee5d9125dcb41156e67c92a92bc0608d720660',
    accountant: '0x71A8166096F86EACa45AD97b9B4F34Bc97FfC47c',
    chain: 'berachain',
    decimals: 18,
    rewardTokens: [
      '0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590', // WETH
      '0x779ded0c9e1022225f8e0630b35a9b54be713736', // USDT0
    ],
    underlyingTokens: [
      '0x2f6f07cdcf3588944bf4c42ac74ff24bf56e7590', // WETH
    ],
    url: 'https://app.primevaults.finance/vault-details/0xccee5d9125dcb41156e67c92a92bc0608d720660',
  },
  {
    name: 'PrimeBTC Vault',
    symbol: 'PrimeBTC',
    vault: '0xd57c84f393b01ec01e1f42a9977795b2bca95837',
    accountant: '0x7c6c4554eC10b4BdA09d7a6fa9Be423896942A31',
    chain: 'berachain',
    decimals: 8,
    rewardTokens: [
      '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // WBTC
      '0x779ded0c9e1022225f8e0630b35a9b54be713736', // USDT0
    ],
    underlyingTokens: [
      '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // WBTC
    ],
    url: 'https://app.primevaults.finance/vault-details/0xd57c84f393b01ec01e1f42a9977795b2bca95837',
  },
  {
    name: 'PrimeBERA Vault',
    symbol: 'PrimeBERA',
    vault: '0x3af6cbd76fdb0c6315b7748ba11243830565e783',
    accountant: '0x1d7e0B3070d80899bCd61A9c484780F54B1543D6',
    chain: 'berachain',
    decimals: 18,
    rewardTokens: [
      '0x6969696969696969696969696969696969696969', // WBERA
      '0x779ded0c9e1022225f8e0630b35a9b54be713736', // USDT0
    ],
    underlyingTokens: [
      '0x6969696969696969696969696969696969696969', // WBERA
    ],
    url: 'https://app.primevaults.finance/vault-details/0x3af6cbd76fdb0c6315b7748ba11243830565e783',
  },
];

const getApyByApi = async (vault) => {
  try {
    const response = await axios.get(`${analyticsApiUrl}/${vault.vault}`);
    const apy = response.data.data.displayApy;
    return apy;
  } catch (e) {
    return null;
  }
};

const getTotalSupply = async (vault) => {
  if (vault.chains) {
    const supplies = await Promise.all(
      vault.chains.map(async (chain) => {
        try {
          const result = await sdk.api.abi.call({
            target: vault.vault,
            abi: 'erc20:totalSupply',
            chain,
          });
          return Number(result.output) / Math.pow(10, vault.decimals);
        } catch (e) {
          return 0;
        }
      })
    );
    return supplies.reduce((sum, s) => sum + s, 0);
  }

  const result = await sdk.api.abi.call({
    target: vault.vault,
    abi: 'erc20:totalSupply',
    chain: vault.chain,
  });
  return Number(result.output) / Math.pow(10, vault.decimals);
};

const getTvl = async (vault, totalSupply, currentRate) => {
  const vaultKey = `${vault.chain}:${vault.vault}`;
  const underlyingKey = `${vault.chain}:${vault.underlyingTokens[0]}`;
  const priceRes = await axios.get(
    `https://coins.llama.fi/prices/current/${vaultKey},${underlyingKey}`
  );

  if (priceRes.data.coins[vaultKey]?.price) {
    return totalSupply * priceRes.data.coins[vaultKey].price;
  }
  if (priceRes.data.coins[underlyingKey]?.price) {
    const rate = currentRate / Math.pow(10, vault.decimals);
    return totalSupply * rate * priceRes.data.coins[underlyingKey].price;
  }
  return 0;
};

const getRate = async (accountant, chain, block) => {
  try {
    const result = await sdk.api.abi.call({
      target: accountant,
      abi: 'function getRate() view returns (uint256)',
      chain,
      block: block || undefined,
    });
    return Number(result.output);
  } catch (e) {
    return null;
  }
};

const apy = async () => {
  const pools = [];

  for (const vault of vaults) {
    try {
      const currentRate = await getRate(vault.accountant, vault.chain, null);
      if (!currentRate) continue;

      const totalSupply = await getTotalSupply(vault);
      const tvlUsd = await getTvl(vault, totalSupply, currentRate);

      const apyBase = (await getApyByApi(vault)) || 0;

      pools.push({
        pool: `${vault.vault}-${vault.chain}`.toLowerCase(),
        chain: utils.formatChain(vault.chain),
        project: 'prime-vaults',
        symbol: vault.symbol,
        tvlUsd,
        apyBase,
        rewardTokens: vault.rewardTokens,
        underlyingTokens: vault.underlyingTokens,
        url: vault.url,
      });
    } catch (e) {
      console.error(`Error processing ${vault.name}:`, e.message);
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://primevaults.finance/',
};
