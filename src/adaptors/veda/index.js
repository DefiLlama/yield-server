const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const vaults = [
  {
    name: 'Lido Golden Goose Vault',
    symbol: 'GGV',
    vault: '0xef417FCE1883c6653E7dC6AF7c6F85CCDE84Aa09',
    chain: 'ethereum',
    decimals: 18,
    underlyingTokens: [
      '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
      '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', // wstETH
    ],
    url: 'https://app.veda.tech/vaults/lido-golden-goose-vault',
  },
  {
    name: 'Lombard DeFi Vault',
    symbol: 'LBTCv',
    vault: '0x5401b8620E5FB570064CA9114fd1e135fd77D57c',
    chain: 'ethereum',
    decimals: 8,
    apiUrl:
      'https://bff.prod.lombard-fi.com/sevenseas-api/daily-data/all/0x5401b8620E5FB570064CA9114fd1e135fd77D57c/0/latest',
    underlyingTokens: [
      '0x8236a87084f8B84306f72007F36F2618A5634494', // LBTC
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    ],
    url: 'https://app.veda.tech/vaults/lombard-defi-vault',
  },
  {
    name: 'PlasmaUSD',
    symbol: 'PlasmaUSD',
    vault: '0xd1074E0AE85610dDBA0147e29eBe0D8E5873a000',
    chain: 'ethereum',
    displayChain: 'plasma',
    chains: ['ethereum', 'plasma'],
    decimals: 6,
    underlyingTokens: [
      'ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      'ethereum:0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    ],
    url: 'https://app.veda.tech/vaults/plasmausd',
  },
  {
    name: 'Veda USD Vault',
    symbol: 'vedaUSD',
    vault: '0x71b9601d96B7e43C434d07D4AE1Aa26650920aA7',
    chain: 'ethereum',
    decimals: 6,
    underlyingTokens: [
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    ],
    url: 'https://app.veda.tech/vaults/usd-vault',
  },
];

const SECONDS_PER_DAY = 86400;

const calculateApr = (currentRate, pastRate, days) => {
  if (!pastRate || pastRate <= 0 || currentRate === pastRate) return null;
  return ((currentRate - pastRate) / pastRate / days) * 365 * 100;
};

const getBlock = async (timestamp, chain = 'ethereum') => {
  try {
    const response = await axios.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    return response.data.height;
  } catch (e) {
    console.error(`Error fetching block for ${chain} at ${timestamp}:`, e.message);
    return null;
  }
};

const getAccountant = async (vaultAddress, chain) => {
  try {
    const hookResult = await sdk.api.abi.call({
      target: vaultAddress,
      abi: 'function hook() view returns (address)',
      chain,
    });

    if (hookResult.output === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    const accountantResult = await sdk.api.abi.call({
      target: hookResult.output,
      abi: 'function accountant() view returns (address)',
      chain,
    });
    return accountantResult.output;
  } catch (e) {
    return null;
  }
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

const getApyFromApi = async (apiUrl) => {
  try {
    const response = await axios.get(apiUrl);
    const data = response.data;
    if (!data || data.length === 0) return null;

    const latest = data[0];
    let apyBase7d = null;
    if (data.length >= 7) {
      const recent7d = data.slice(0, 7);
      apyBase7d =
        recent7d.reduce((sum, d) => sum + (d.daily_apy || 0), 0) /
        recent7d.length;
    }

    return {
      apyBase: latest.daily_apy || 0,
      apyBase7d,
    };
  } catch (e) {
    return null;
  }
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [block1d, block7d] = await Promise.all([
    getBlock(now - SECONDS_PER_DAY),
    getBlock(now - 7 * SECONDS_PER_DAY),
  ]);

  const pools = [];

  for (const vault of vaults) {
    try {
      const accountant = await getAccountant(vault.vault, vault.chain);
      if (!accountant) continue;

      const currentRate = await getRate(accountant, vault.chain, null);
      if (!currentRate) continue;

      const totalSupply = await getTotalSupply(vault);
      const tvlUsd = await getTvl(vault, totalSupply, currentRate);

      let apyBase, apyBase7d;

      if (vault.apiUrl) {
        const apiApy = await getApyFromApi(vault.apiUrl);
        apyBase = apiApy?.apyBase || 0;
        apyBase7d = apiApy?.apyBase7d || 0;
      } else {
        // Calculate APY from on-chain rate changes (skip if blocks unavailable)
        const [rate1d, rate7d] = await Promise.all([
          block1d ? getRate(accountant, vault.chain, block1d) : null,
          block7d ? getRate(accountant, vault.chain, block7d) : null,
        ]);
        const apr1d = calculateApr(currentRate, rate1d, 1);
        const apr7d = calculateApr(currentRate, rate7d, 7);
        apyBase = apr1d || apr7d || 0;
        apyBase7d = apr7d || 0;
      }

      const poolChain = vault.displayChain || vault.chain;
      pools.push({
        pool: `${vault.vault}-${poolChain}`.toLowerCase(),
        chain: utils.formatChain(poolChain),
        project: 'veda',
        symbol: vault.symbol,
        tvlUsd,
        apyBase,
        apyBase7d,
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
  url: 'https://veda.tech/',
};
