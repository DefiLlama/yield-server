// Llama
const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const { request } = require('graphql-request');
const { default: BigNumber } = require('bignumber.js');

// Impermax
const {
  blacklistedLendingPools,
  blacklistedLendingVaults,
} = require('./blacklist.js');
const { graphQuery, vaultGraphQuery } = require('./query.js');
const { GECKOTERMINAL_IDS } = require('./geckoterminal.js');

/**
 *  LENDING POOLS CONFIGS
 */

const config = {
  ethereum: [
    'https://api.studio.thegraph.com/query/46041/impermax-mainnet-v1/v0.0.1',
  ],
  polygon: [
    'https://api.studio.thegraph.com/query/46041/impermax-x-uniswap-v2-polygon-v2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-polygon-solv2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-polygon-sol-stable/v0.0.1',
  ],
  arbitrum: [
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-v1/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-v2/v0.0.1',
    'https://api.studio.thegraph.com/query/46041/impermax-arbitrum-solv2/v0.0.2',
  ],
  optimism: [
    'https://api.studio.thegraph.com/query/46041/impermax-optimism-solv2/v0.0.1',
  ],
  fantom: [
    'https://api.studio.thegraph.com/query/46041/impermax-fantom-solv2/v0.0.2',
  ],
  base: [
    'https://api.studio.thegraph.com/query/46041/impermax-base-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-base-solv2-stable/v0.0.1',
  ],
  scroll: [
    'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2/v0.0.2',
    'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2-stable/0.0.9',
  ],
  real: [
    'https://api.goldsky.com/api/public/project_cm2d5q4l4w31601vz4swb3vmi/subgraphs/impermax-finance/impermax-real-v2-stable/gn',
    'https://api.goldsky.com/api/public/project_cm2rhb30ot9wu01to8c9h9e37/subgraphs/impermax-real-solv2/3.0/gn',
  ],
  // Skip these as tvl is too low
  // avalanche: [], moonriver: [], canto: [], zkSync: []
};

// DEXes or all our StakedLP Token factories for the dex
const projectPoolFactories = {
  ethereum: {
    UniswapV2: ['0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'],
  },
  polygon: {
    Quickswap: ['0x5757371414417b8c6caad45baef941abc7d3ab32'],
    Sushiswap: ['0xc35dadb65012ec5796536bd9864ed8773abc74c4'],
    Apeswap: ['0xcf083be4164828f00cae704ec15a36d711491284'],
    Tetuswap: ['0x684d8c187be836171a1af8d533e4724893031828'],
    Pearl: [
      '0xb07c75e3db03eb69f047b92274019912014ba78e',
      '0x1a645bfb46b00bb2dce6a1a517d7de2999155fe4',
      '0xfb8bd40c0a13d141b26ee190ca87991ec54932e9',
    ],
    Satin: ['0xcaf3fb1b03f1d71a110167327f5106be82bee209'],
  },
  arbitrum: {
    Sushiswap: ['0xc35dadb65012ec5796536bd9864ed8773abc74c4'],
    DXSwap: ['0x359f20ad0f42d75a5077e65f30274cabe6f4f01a'],
    Arbidex: ['0x1c6e968f2e6c9dec61db874e28589fd5ce3e1f2c'],
    Swapfish: ['0x71539d09d3890195dda87a6198b98b75211b72f3'],
    Zyberswap: ['0xac2ee06a14c52570ef3b9812ed240bce359772e7'],
    Chronos: ['0x111eeeb6bfab9e8d0e87e45db15031d89846e5d7'],
    Ramses: ['0x78a2251f1aaeaa8fc1eafcc379663cca3f894708'],
    Solunea: ['0x6ef065573cd3fff4c375d4d36e6ca93cd6e3d499'],
    SolidLizard: ['0x734d84631f00dc0d3fcd18b04b6cf42bfd407074'],
    Auragi: ['0x268bb0220ab61abd9bd42c5db49470bb3e6b0b2f'],
  },
  optimism: {
    Velodrome: ['0xf1046053aa5682b4f9a81b5481394da16be5ff5a'],
  },
  fantom: {
    Equalizer: ['0xc6366efd0af1d09171fe0ebf32c7943bb310832a'],
  },
  base: {
    Aerodrome: ['0x420dd381b31aef6683db6b902084cb0ffece40da'],
    Scale: ['0xed8db60acc29e14bc867a497d94ca6e3ceb5ec04'],
  },
  scroll: {
    Tokan: [
      '0x92af10c685d2cf4cd845388c5f45ac5dc97c5024',
      '0x074568f090e93194289c2c2bf285ee7f60b485a9',
      '0x6c041ff2d25310a2751c57555265f2364caca195',
    ],
  },
  avalanche: {
    TraderJoe: ['0x9ad6c38be94206ca50bb0d90783181662f0cfa10'],
    Pangolin: ['0xefa94de7a4656d787667c749f7e1223d71e9fd88'],
    Thorus: ['0xa98ea6356a316b44bf710d5f9b6b4ea0081409ef'],
  },
  real: {
    PearlV2: [
      '0x28e22d8c807b6e6c0eca4373fc3b9920453ceeee',
      '0x317371f126680734d7db2ace2d751ffc0bd4b771',
      '0x2b965fdf04f9e9beef1659464ef3a0094a68d923',
    ],
  },
};

/**
 * Gets all impermax borrowables in `chain`
 */
const getChainBorrowables = async (chain) => {
  const urls = config[chain];
  let allBorrowables = [];

  for (const url of urls) {
    const queryResult = await request(url, graphQuery);
    allBorrowables = allBorrowables.concat(queryResult.borrowables);
  }

  const blacklist = blacklistedLendingPools[chain] || [];
  return allBorrowables.filter((i) => !blacklist.includes(i.lendingPool.id));
};

/**
 * Gets a third party DEX given a factory address
 */
const getProject = (chain, factoryAddress) => {
  const chainProjects = projectPoolFactories[chain] || {};
  for (const [project, factories] of Object.entries(chainProjects)) {
    if (factories.includes(factoryAddress.toLowerCase())) return project;
  }

  return null;
};

/**
 *  LENDING VAULTS CONFIGS
 */

const lendingVaultsConfig = {
  polygon: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-polygon/v0.0.1',
  ],
  arbitrum: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-arbitrum/v0.0.1',
  ],
  base: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-base/v0.0.1',
  ],
  scroll: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-scroll/v0.0.1',
  ],
  real: [],
  fantom: [],
  optimism: [],
  arbitrum: [],
  ethereum: [],
};

const lendingVaultProfiles = {
  arbitrum: [
    {
      address: '0x1122745fE34590419e18394bAA0e4D610f785205'.toLowerCase(),
      risk: 'Conservative',
    }, // ETH
    {
      address: '0x46D26374903F215DC28d461809cdd0667A603a9e'.toLowerCase(),
      risk: 'Conservative',
    }, // USDC
  ],
  polygon: [
    {
      address: '0xbF6d92C989bF14DCff0713341EbFa89C63c89EF9'.toLowerCase(),
      risk: 'Conservative',
    }, // MATIC
    {
      address: '0x59D2dFd97cB27e127F36a730CD2E3B7e5C2C1983'.toLowerCase(),
      risk: 'Conservative',
    }, // USDT
    {
      address: '0xE71675a4D284447abc8fCC834a6F54847A765584'.toLowerCase(),
      risk: 'Conservative',
    }, // USDC
  ],
  scroll: [
    {
      address: '0x20e29CF92C89DC97f6b131000F18c39bdc6964af'.toLowerCase(),
      risk: 'Conservative',
    }, // ETH
    {
      address: '0x175732fBD755c5282dcD1618664e607d487DB5eC'.toLowerCase(),
      risk: 'Conservative',
    }, // USDC
    {
      address: '0x83F22f87f504F8b9f10eb73ab05c58A0973b6681'.toLowerCase(),
      risk: 'Conservative',
    }, // CHI
  ],
  base: [
    {
      address: '0x0a19875829fDF28b8e3230A3F1EB46668240cc11'.toLowerCase(),
      risk: 'Conservative',
    }, // ETH
    {
      address: '0x929265aaD975CfeDedb65A19a05A3Be2196766F1'.toLowerCase(),
      risk: 'Conservative',
    }, // USDC
    {
      address: '0x683cc7cbb8b8c5b3c5fae85a4ae70e887217883b'.toLowerCase(),
      risk: 'Aggressive',
    }, // ETH (high)
  ],
};

/**
 * Gets all deployed lending vaults in `chain`
 */
const getChainVaults = async (chain) => {
  const urls = lendingVaultsConfig[chain];
  let allLendingVaults = [];

  for (const url of urls) {
    const queryResult = await request(url, vaultGraphQuery);
    allLendingVaults = allLendingVaults.concat(queryResult.lendingVaults);
  }

  const blacklist = blacklistedLendingVaults[chain] || [];
  return allLendingVaults.filter((i) => !blacklist.includes(i.id));
};

/**
 *  TOKEN PRICES
 */

// Try llama, then geckoterminal, if all fail exclude
async function getChainUnderlyingPrices(chain, tokenAddresses) {
  // Remove duplicate underlyings
  const uniqueTokens = [...new Set(tokenAddresses)];

  const { tokenPrices, missingTokens } = await getPriceFromDefiLlama(
    chain,
    uniqueTokens
  );
  if (tokenPrices && missingTokens.length == 0) return tokenPrices;

  const coingeckoPrices = await getPriceFromGeckoTerminal(chain, missingTokens);
  if (coingeckoPrices) {
    for (const [key, price] of Object.entries(coingeckoPrices)) {
      if (price) tokenPrices[key] = price;
    }
  }

  return tokenPrices;
}

const getPriceFromDefiLlama = async (chain, tokenAddresses) => {
  const MAX_LLAMA_COINS = 100;
  const tokenPrices = {};
  const missingTokens = [];

  try {
    for (let i = 0; i < tokenAddresses.length; i += MAX_LLAMA_COINS) {
      const maxTokens = tokenAddresses.slice(i, i + MAX_LLAMA_COINS);
      const chainTokens = maxTokens.map((address) => `${chain}:${address}`);

      const { coins } = await fetch(
        `https://coins.llama.fi/prices/current/${chainTokens.join(',')}`
      ).then((i) => i.json());

      maxTokens.forEach((token) => {
        const key = `${chain}:${token}`;
        const tokenPrice = coins[key]?.price;

        // Push to missing and try get these from gecko
        if (!tokenPrice) {
          missingTokens.push(token);
          return;
        }

        tokenPrices[key] = parseFloat(tokenPrice);
      });
    }

    return { tokenPrices, missingTokens };
  } catch (error) {
    console.warn(`DefiLlama prices fail on ${chain}:`, error.message);
    return { undefined, missingTokens: tokenAddresses };
  }
};

async function getPriceFromGeckoTerminal(chain, tokenAddresses) {
  console.log(`Getting ${tokenAddresses.length} tokens from gecko on ${chain}`);
  const MAX_GECKO_COINS = 25;
  const geckoChainId = GECKOTERMINAL_IDS[chain];
  const tokenPrices = {};

  try {
    for (let i = 0; i < tokenAddresses.length; i += MAX_GECKO_COINS) {
      const maxTokens = tokenAddresses.slice(i, i + MAX_GECKO_COINS);
      const tokens = maxTokens.join(',');

      const { data } = await fetch(
        `https://api.geckoterminal.com/api/v2/simple/networks/${geckoChainId}/token_price/${tokens}`
      ).then((i) => i.json());

      maxTokens.forEach((token) => {
        const key = `${chain}:${token}`;
        const tokenPrice = data.attributes.token_prices[token];

        if (!tokenPrice) {
          console.warn(`No price found on Gecko for token: ${token}`);
          return;
        }

        tokenPrices[key] = parseFloat(tokenPrice);
      });
    }
    return tokenPrices;
  } catch (error) {
    console.error(`Gecko prices fail on ${chain}:`, error.message);
    return undefined;
  }
}

/**
 *  BORROWABLE YIELDS
 */

const SECONDS_PER_YEAR = BigNumber(60 * 60 * 24 * 365);

// Since we're a lending protocol the TVL is the excess supply (ie. `totalBalance`)
const getTvlUsd = (totalBalance, tokenPriceUsd) =>
  BigNumber(totalBalance).times(BigNumber(tokenPriceUsd));

const getBorrowApr = (borrowRate) =>
  BigNumber(borrowRate).times(SECONDS_PER_YEAR).times(BigNumber(100));

const getSupplyApr = (
  totalBorrows,
  totalBalance,
  borrowRate,
  reserveFactor
) => {
  if (BigNumber(totalBorrows).eq(BigNumber(0))) return BigNumber(0);

  const utilization = BigNumber(totalBorrows).div(
    BigNumber(totalBorrows).plus(BigNumber(totalBalance))
  );

  return BigNumber(borrowRate)
    .times(utilization)
    .times(BigNumber(1).minus(BigNumber(reserveFactor)));
};

const getTotalBorrowsUsd = (totalBorrows, tokenPriceUsd) =>
  BigNumber(totalBorrows).times(BigNumber(tokenPriceUsd));

const getLtv = (safetyMargin, liqIncentive, liqFee) =>
  BigNumber(1).div(
    BigNumber(safetyMargin).sqrt().times(BigNumber(liqIncentive).plus(liqFee))
  );

const getTotalSupplyUsd = (totalBalance, totalBorrows, tokenPriceUsd) =>
  BigNumber(totalBorrows)
    .plus(BigNumber(totalBalance))
    .times(BigNumber(tokenPriceUsd));

/**
 * -> Loop through each chain from config
 *   -> Get all borrowables + lending vaults on this chain
 *   -> Get all borrowable underlyings prices on this chain
 *   -> Loop through each borrowable on this chain
 *     -> Match project from this borrowable's `uniswapV2Factory` and add to pools array
 *   -> Loop through each lending vault on this chain
 *     -> Get vault risk profile and add to pools and add to pools aray
 */
const main = async () => {
  const pools = [];
  const chains = Object.keys(config);

  for (const chain of chains) {
    const [borrowables, lendingVaults] = await Promise.all([
      getChainBorrowables(chain),
      getChainVaults(chain),
    ]);

    const prices = await getChainUnderlyingPrices(
      chain,
      borrowables.map((i) => i.underlying.id)
    );

    /**
     * Add borrowables
     */
    for (const borrowable of borrowables) {
      const {
        id,
        underlying,
        totalBorrows,
        totalBalance,
        reserveFactor,
        borrowRate,
        lendingPool,
      } = borrowable;

      const project = getProject(chain, lendingPool.pair.uniswapV2Factory);
      if (!project) {
        console.warn(`Missing project, skipping pool ${lendingPool.id} `);
        continue;
      }

      const price = prices[`${chain}:${underlying.id}`];
      if (!price) {
        console.warn(`Missing price, skipping pool ${lendingPool.id} `);
        continue;
      }

      const { safetyMargin, liquidationFee, liquidationIncentive } =
        lendingPool.collateral;

      const ltv = getLtv(safetyMargin, liquidationIncentive, liquidationFee);
      const tvlUsd = getTvlUsd(totalBalance, price);
      const totalBorrowsUsd = getTotalBorrowsUsd(totalBorrows, price);
      const totalSupplyUsd = getTotalSupplyUsd(
        totalBalance,
        totalBorrows,
        price
      );
      const borrowApr = getBorrowApr(borrowRate);
      const supplyApr = getSupplyApr(
        totalBorrows,
        totalBalance,
        borrowApr,
        reserveFactor
      );

      const { token0, token1 } = lendingPool.pair;

      pools.push({
        pool: `${lendingPool.id}-${underlying.symbol}-${chain}`.toLowerCase(),
        poolMeta: `${project} ${token0.symbol}/${token1.symbol}`,
        chain,
        project: 'impermax-finance',
        symbol: underlying.symbol,
        tvlUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowsUsd.toNumber(),
        totalSupplyUsd: totalSupplyUsd.toNumber(),
        apyBase: supplyApr.toNumber(),
        apyBaseBorrow: borrowApr.toNumber(),
        underlyingTokens: [token0.id, token1.id],
        ltv: ltv.toNumber().toFixed(3),
        url: 'https://impermax.finance',
      });
    }

    /**
     * Add lending vaults
     */
    for (const vault of lendingVaults) {
      const { id, supplyRate, underlying, availableLiquidity } = vault;

      const price = prices[`${chain}:${underlying.id}`];
      if (!price) {
        console.warn(`Missing price, skipping vault ${vault.id} `);
        continue;
      }

      const apyBase = Number(supplyRate) * 24 * 60 * 60 * 365 * 100;
      const tvlUsd = price * Number(availableLiquidity);

      const chainVaults = lendingVaultProfiles[chain] || [];
      const lendingVault = chainVaults.find(
        (v) => v.address.toLowerCase() === id.toLowerCase()
      );

      pools.push({
        pool: `${lendingVault.address}-${underlying.symbol}-${chain}`.toLowerCase(),
        poolMeta: `${lendingVault?.risk}`,
        chain,
        project: 'impermax-finance',
        symbol: underlying.symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [underlying.id],
        url: 'https://lite.impermax.finance/',
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
};
