const axios = require('axios');
const superagent = require('superagent');
const { get } = require('lodash');
const sdk = require('@defillama/sdk');

// Helper for chain ids
const CHAIN_CONFIG = {
  '43114': { chain: 'avax', chainName: 'Avalanche' },
  '42161': { chain: 'arbitrum', chainName: 'Arbitrum' },
  '5000': { chain: 'mantle', chainName: 'Mantle' },
}

// Yield Yak vaults configuration
const VAULT_ACCOUNTANT_ABI = 'function getRate() external view returns (uint256)'
const VAULTS = [
  {
    chainId: '43114',
    address: '0xDf788AD40181894dA035B827cDF55C523bf52F67',
    accountant: '0xA8d0c29cF475dD91Fe043D376bEFDDeEC2d2e24A',
    symbol: 'rsAVAX',
    underlyingToken: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE',
    rateDecimals: 18,
  },
  {
    chainId: '43114',
    address: '0x9D15A28fCB96AF5e26dd0EF546D6a777C0ec34cd',
    accountant: '0x46520834D24FBF4e556576a8BB29eB8500378561',
    symbol: 'rstAVAX',
    underlyingToken: '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3',
    rateDecimals: 18,
  },
  {
    chainId: '43114',
    address: '0xe684F692bdf5B3B0DB7E8e31a276DE8A2E9F0025',
    accountant: '0x57392E941a72cA47097135b9567C2c9Da8B2E0Fc',
    symbol: 'rBTC.b',
    underlyingToken: '0x152b9d0FdC40C096757F570A51E494bd4b943E50',
    rateDecimals: 8,
  },
  {
    chainId: '43114',
    address: '0xa845Cbe370B99AdDaB67AfE442F2cF5784d4dC29',
    accountant: '0x6870599e4ffB6b9aB7facA3420875A1D2e188906',
    symbol: 'aiAVAX',
    underlyingToken: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    rateDecimals: 18,
  },
  {
    chainId: '43114',
    address: '0xdC038cFf8E55416a5189e37F382879c19217a4CB',
    accountant: '0x5A26Fb0b0b008FB372E5F830b474ABF374FA11f8',
    symbol: 'aiUSD',
    underlyingToken: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    rateDecimals: 6,
  },
  {
    chainId: '43114',
    address: '0x0FB51627a4D9E01B24C427BB62Ed8d5C9018f8F6',
    accountant: '0x00da610F7b9bc42fa2EF2D4BA312f8cD95131fA2',
    symbol: 'aiBTC',
    underlyingToken: '0x152b9d0FdC40C096757F570A51E494bd4b943E50',
    rateDecimals: 6,
  },
  {
    chainId: '43114',
    address: '0x72Ab674eC8FB2b2626Cf48131Fe34fC95075D9b5',
    accountant: '0x5554A2b4dB48a5B923F7C74798F679F8458e3BE6',
    symbol: 'sSUZ',
    underlyingToken: '0x451532F1C9eb7E4Dc2d493dB52b682C0Acf6F5EF',
    rateDecimals: 18,
  }
];

/**
 * Get prices for a list of addresses on a single chain
 * @param {string} chain in slug format
 * @param {string[]} addresses in format address
 */
const getPrices = async (chain, addresses) => {
  if (!addresses || addresses.length === 0) {
    return { pricesByAddress: {}, pricesBySymbol: {} };
  }

  const priceKeys = addresses.map((address) => `${chain}:${address}`).join(',');
  const response = await superagent.get(
    `https://coins.llama.fi/prices/current/${priceKeys.toLowerCase()}`
  );

  const prices = response.body.coins || {};

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

/**
 * Get vault data for a single vault
 * @param {Object} vaultConfig
 * @param {string} vaultConfig.chainId
 * @param {string} vaultConfig.address
 * @param {string} vaultConfig.accountant
 * @param {string} vaultConfig.symbol
 * @param {string} vaultConfig.underlyingToken
 * @param {number} vaultConfig.rateDecimals
 */
const getVaultData = async (vaultConfig) => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  // Get block numbers for historical data
  const chain = CHAIN_CONFIG[vaultConfig.chainId].chain;
  const [block1dayAgo, block7dayAgo] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/${chain}/${timestamp1dayAgo}`),
    axios.get(`https://coins.llama.fi/block/${chain}/${timestamp7dayAgo}`)
  ]);

  // Get exchange rates from accountant
  const [
    currentRate,
    rate1dayAgo,
    rate7dayAgo,
    currentSupplyWei
  ] = await Promise.all([
    sdk.api.abi.call({
      target: vaultConfig.accountant,
      abi: VAULT_ACCOUNTANT_ABI,
      chain: chain
    }),
    sdk.api.abi.call({
      target: vaultConfig.accountant,
      abi: VAULT_ACCOUNTANT_ABI,
      chain: chain,
      block: block1dayAgo.data.height
    }),
    sdk.api.abi.call({
      target: vaultConfig.accountant,
      abi: VAULT_ACCOUNTANT_ABI,
      chain: chain,
      block: block7dayAgo.data.height
    }),
    sdk.api.abi.call({
      target: vaultConfig.address,
      abi: 'erc20:totalSupply',
      chain: chain
    })
  ]);

  const totalSupply = currentSupplyWei.output / 1e18;

  // Get underlying token price
  const priceKey = `${chain}:${vaultConfig.underlyingToken}`;
  const underlyingPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  if (!underlyingPrice) {
    console.log(`Underlying token price not found, skipping ${vaultConfig.symbol} vault`);
    return null;
  }

  // Calculate APY and TVL
  const rateDenominator = 10 ** vaultConfig.rateDecimals;
  const currentRateNormalized = currentRate.output / rateDenominator;
  const rate1dayAgoNormalized = rate1dayAgo.output / rateDenominator;
  const rate7dayAgoNormalized = rate7dayAgo.output / rateDenominator;
  
  // Calculate APY based on percentage change in exchange rate
  const dailyRate = rate1dayAgoNormalized > 0 ? (currentRateNormalized - rate1dayAgoNormalized) / rate1dayAgoNormalized : 0;
  const apr1d = dailyRate * 365 * 100;
  const apy1d = (Math.pow(1 + dailyRate, 365) - 1) * 100;

  const weeklyRate = rate7dayAgoNormalized > 0 ? (currentRateNormalized - rate7dayAgoNormalized) / rate7dayAgoNormalized / 7 : 0;
  const apr7d = weeklyRate * 365 * 100;
  const apy7d = (Math.pow(1 + weeklyRate, 365) - 1) * 100;
  const tvlUsd = totalSupply * currentRateNormalized * underlyingPrice;

  const chainName = CHAIN_CONFIG[vaultConfig.chainId].chainName;

  return {
    pool: vaultConfig.address,
    chain: chainName,
    project: 'yield-yak-aggregator',
    symbol: vaultConfig.symbol,
    poolMeta: 'Milk Vault',
    apyBase: apy1d,
    apyBase7d: apy7d,
    underlyingTokens: [vaultConfig.underlyingToken],
    tvlUsd: tvlUsd,
  };
};

/**
 * Get all vault data
 * @returns {Object[]} Array of vault data objects
 */
const getAllVaultData = async () => {
  const vaultPromises = VAULTS.map(vaultConfig => getVaultData(vaultConfig));
  const vaultResults = await Promise.all(vaultPromises);
  return vaultResults.filter(result => result !== null);
};

/**
 * Get farm data for a single chain
 * @param {string} chainId
 * @returns {Object[]} Array of farm data objects
 */
const getFarms = async (chainId) => {
  const chain = CHAIN_CONFIG[chainId].chain;
  const [{ data: farms }, { data: apys }] = await Promise.all([
    axios.get(`https://staging-api.yieldyak.com/${chainId}/farms`),
    axios.get(`https://staging-api.yieldyak.com/${chainId}/apys`),
  ]);

  const farmsWithApys = farms.filter((farm) => apys.hasOwnProperty(farm.address));
  const tokens = [
    ...new Set(
      farmsWithApys
        .map(({ depositToken }) =>
          (depositToken.underlying || []).map((token) => token.toLowerCase())
        )
        .flat()
    ),
  ];

  const { pricesByAddress, pricesBySymbol } = await getPrices(chain, tokens);

  const farmResults = farmsWithApys
    .map((farm) => {
      let tvlUsd = 0;

      const isLp = !!farm.lpToken;
      if (isLp) {
        const token0Symbol = get(farm, 'token0.symbol', '').toLowerCase();
        const token1Symbol = get(farm, 'token1.symbol', '').toLowerCase();
        const token0Reserves = Number(get(farm, 'token0.reserves', 0));
        const token1Reserves = Number(get(farm, 'token1.reserves', 0));
        const token0Price = pricesBySymbol[token0Symbol];
        const token1Price = pricesBySymbol[token1Symbol];

        if (token0Price && token1Price && token0Price > 0 && token1Price > 0) {
          const token0Usd = token0Price * token0Reserves;
          const token1Usd = token1Price * token1Reserves;
          tvlUsd =
            (token0Usd > token1Usd ? token1Usd : token0Usd) *
            2 *
            (farm.totalDeposits / farm.lpToken.supply);
        } else {
          // Try to calculate TVL with available price data
          if (token0Price && token0Price > 0 && token0Reserves > 0) {
            tvlUsd = token0Price * token0Reserves * 2 * (farm.totalDeposits / farm.lpToken.supply);
          } else if (token1Price && token1Price > 0 && token1Reserves > 0) {
            tvlUsd = token1Price * token1Reserves * 2 * (farm.totalDeposits / farm.lpToken.supply);
          }
        }
      } else {
        let tokenPrice = 0;

        if (farm.platform == 'wombat') {
          const tokenSymbol = farm.depositToken.underlying[0].toLowerCase();
          tokenPrice = pricesByAddress[tokenSymbol];
        } else {
          const tokenSymbol = farm.depositToken.address.toLowerCase();
          const tokenName = farm.name.toLowerCase();
          tokenPrice =
            pricesByAddress[tokenSymbol] || pricesBySymbol[tokenName];
        }

        if (farm.depositToken.stablecoin) {
          tvlUsd = Number(farm.totalDeposits);
        } else if (tokenPrice && tokenPrice > 0) {
          tvlUsd = tokenPrice * Number(farm.totalDeposits);
        }
      }

      // Ensure tvlUsd is a valid number
      if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
        tvlUsd = 0;
      }

      const chainName = CHAIN_CONFIG[chainId].chainName;

      return {
        pool: farm.address,
        chain: chainName,
        project: 'yield-yak-aggregator',
        symbol: farm.name,
        poolMeta: farm.platform,
        apyBase: apys[farm.address].apy,
        underlyingTokens: farm.depositToken.underlying,
        tvlUsd: tvlUsd,
      };
    });

  return farmResults;
}

const getAllFarmData = async () => {
  const farmPromises = Object.keys(CHAIN_CONFIG).map(chainId => getFarms(chainId));
  const farmResults = await Promise.all(farmPromises);
  return farmResults.flat();
}

const main = async () => {
  const [farmData, vaultData] = await Promise.all([
    getAllFarmData(),
    getAllVaultData(),
  ]);

  return [...farmData, ...vaultData];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://yieldyak.com/',
};
