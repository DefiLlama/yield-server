// Llama
const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const { request } = require('graphql-request');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

// Impermax
const {
  blacklistedLendingPools,
  blacklistedLendingVaults,
} = require('./blacklist.js');
const { graphQuery, vaultGraphQuery, vaultGraphQueryV2 } = require('./query.js');
const { GECKOTERMINAL_IDS } = require('./geckoterminal.js');

/**
 *  LENDING POOLS CONFIGS
 */

const config = {
  arbitrum: ['https://arbitrum-factory-v3-production.up.railway.app/'],
  base: ['https://base-factory-v3-production.up.railway.app/'],
  unichain: ['https://unichain-factoryv3-production.up.railway.app/'],
  avax: [],
  scroll: [],
  polygon: [],
  sonic: [],
  blast: []
};

const lendingVaultsConfig = {
  polygon: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-polygon/v0.0.3',
  ],
  arbitrum: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-arbitrum/v0.0.4',
  ],
  base: [
    'https://base-lendingvaults-production.up.railway.app',
  ],
  scroll: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-scroll/v0.0.3',
  ],
  real: [],
  fantom: [],
  optimism: [],
  ethereum: [],
  blast: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-blast/v0.0.2',
  ],
  sonic: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-sonic/v0.0.3',
  ],
  unichain: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-unichain/v0.0.1',
  ],
  avax: [
    'https://avalanche-lendingvaults-production.up.railway.app'
  ]
};

// NFTLP factory address
const projectPoolFactories = {
  arbitrum: {
    UniswapV3: ['0x4936b5aafe83611aa2fa926a683973ddb48ce7f1'],
  },
  base: {
    UniswapV3: ['0xc2da400cf63e9a01680c8fe14ab360098a35dcd8'],
    Aerodrome: ['0xf159c02bff0617a58d8e5b811aa63ca3aea0bb04']
  },
  unichain: {
    UniswapV3: ['0x62b45128b3c2783d5b1f86e6db92c9aa43eed6af'],
  },
};

// Only list balanced/aggressive vaults as default is conservative
const lendingVaultProfiles = {
  arbitrum: [],
  polygon: [],
  scroll: [],
  base: [
    // These vaults were affected by the exploit, are replaced below
    //{
    //  address: '0x7838a0329CFF90434424952411D5fFE687360F49'.toLowerCase(),
    //  risk: 'Conservative',
    //}, // USDCV2
    //{
    //  address: '0xaD9cfEBB7666f2698cA9d836eD8CBeb0545a4263'.toLowerCase(),
    //  risk: 'Aggressive',
    //}, // ETHV2
    //{
    //  address: '0xa1D0f86d74BB7C832308c640b504b8525168Ed62'.toLowerCase(),
    //  risk: 'Conservative',
    //}, // cbBTCV2 (high)
    {
      address: '0x0988cc53b8Ddd625C20e382f1af2f9c385E4f9A3'.toLowerCase(),
      risk: 'Conservative',
    }, // ETHV2
    {
      address: '0x5e68e1bde6699bae9cab165b35989e5acc6b7e67'.toLowerCase(),
      risk: 'Conservative'
    }, // CBBTC
    {
      address: '0xf7408ba0aaf8ca80d4442731415bbe2156da8958'.toLowerCase(),
      risk: 'Conservative'
    }, // Usdc
    {
      address: '0xad9cfebb7666f2698ca9d836ed8cbeb0545a4263'.toLowerCase(),
      risk: 'Aggressive'
    } // eth
  ],
  blast: [
    {
      address: '0xFBFBd1c9E05c114684Bc447Da5182Fe09315E038'.toLowerCase(),
      risk: 'Balanced',
    }, // ETH
  ],
  sonic: [
    {
      address: '0x49967493310250254Aee27F0AbD2C97b45cb1509'.toLowerCase(),
      risk: 'Balanced',
    }, // ws
    {
      address: '0xDD8761dec5dF366a6AF7fE4E15b8f3888c0a905c'.toLowerCase(),
      risk: 'Balanced',
    }, // usdc.e
    {
      address: '0x835dA504bEfedC85404ad6A11df278049bc56d12'.toLowerCase(),
      risk: 'Balanced',
    }, // weth
  ],
  unichain: [
    {
      address: '0xcae4a89a26aadbe63a20d575259386d3f3dd4e5c'.toLowerCase(),
      risk: "Conservative",
    }, // ETH
    {
      address: '0xdb6a07a55177724e27a47f39fb1f73dba2d7e07a'.toLowerCase(),
      risk: "Conservative",
    }, // USDC
    {
      address: '0x80e019CB1e5b3cb42c66b45974290cfD28FBfe18'.toLowerCase(),
      risk: "Conservative",
    }, // WbBTC
    {
      address: '0x16507321843166033894da01547bf48483a9abc8'.toLowerCase(),
      risk: "Conservative"
    }
  ],
  avax: [
    {
      address: "0x6859e20754ffbf93a81428f3da55c9f0eb723b2a".toLowerCase(),
      risk: "Balanced",
    }, // AVAX
    {
      address: "0xf35c95bd8869f4ae4b68a97e25462c3db08e9468".toLowerCase(),
      risk: "Balanced",
    }, // USDC
    {
      address: "0x738f2d9a7c52f91c4f2fdf515fb8aad951c22cd9".toLowerCase(),
      risk: "Balanced",
    }, // WETH.e
  ]
};

/**
 * Gets all impermax borrowables in `chain`
 */
const getChainBorrowables = async (chain) => {
  const urls = config[chain];
  let allBorrowables = [];

  for (const url of urls) {
    const queryResult = await request(url, graphQuery);
    allBorrowables = allBorrowables.concat(queryResult.borrowables.items);
  }

  const blacklist = blacklistedLendingPools[chain] || [];
  return allBorrowables.filter((i) => !blacklist.includes(i.lendingPool.id));
};

/**
 * Gets all deployed lending vaults in `chain`
 */
const getChainVaults = async (chain) => {
  const urls = lendingVaultsConfig[chain];
  let allLendingVaults = [];

  for (const url of urls) {
    const isV2 = url.includes("railway");
    const queryResult = await request(url, isV2 ? vaultGraphQueryV2 : vaultGraphQuery);
    allLendingVaults = allLendingVaults.concat(isV2 ? queryResult.lendingVaults.items : queryResult.lendingVaults);
  }

  const blacklist = blacklistedLendingVaults[chain] || [];
  return allLendingVaults.filter((i) => !blacklist.includes(i.id));
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

// For urls
const formatImpermaxURLChain = (chain) => {
  if (chain === 'avax') return 'avalanche'
  return chain
}

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

    const chainPools = [...borrowables, ...lendingVaults];
    const prices = await getChainUnderlyingPrices(
      chain,
      chainPools.map((i) => i.underlying.id)
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

      const project = getProject(chain, lendingPool.nftlp.factory);
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

      const { token0, token1 } = lendingPool.nftlp;

      pools.push({
        pool: `${lendingPool.id}-${underlying.symbol}-${chain}`.toLowerCase(),
        poolMeta: `${project} ${token0.symbol}/${token1.symbol}`,
        chain: utils.formatChain(formatImpermaxURLChain(chain)),
        project: 'impermax-v3',
        symbol: underlying.symbol,
        tvlUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowsUsd.toNumber(),
        totalSupplyUsd: totalSupplyUsd.toNumber(),
        apyBase: supplyApr.toNumber(),
        apyBaseBorrow: borrowApr.toNumber(),
        underlyingTokens: [token0.id, token1.id],
        ltv: Number(ltv.toFixed(3)),
        url: `https://app.impermax.finance/markets/${formatImpermaxURLChain(chain)}/8/${lendingPool.id}`, // V3 pools always use factory "8"
      });
    }

    /**
     * Add lending vaults
     */
    for (const vault of lendingVaults) {
      const { id, supplyRate, underlying, totalSupply, exchangeRate } = vault;

      const price = prices[`${chain}:${underlying.id}`];
      if (!price) {
        console.warn(`Missing price, skipping vault ${vault.id} on ${chain}`);
        continue;
      }

      const apyBase = Number(supplyRate) * 24 * 60 * 60 * 365 * 100;
      const tvlUsd = price * Number(totalSupply) * Number(exchangeRate);

      const chainVaults = lendingVaultProfiles[chain] || [];
      const vaultRisk = chainVaults.find((v) => v?.address.toLowerCase() === id.toLowerCase())?.risk;
      if (!vaultRisk) {
        console.warn(`Deprecated vault or missing profile, skipping vault ${vault.id} on ${chain}`)
        continue;
      }

      pools.push({
        pool: `${id}-${underlying.symbol}-${chain}`.toLowerCase(),
        poolMeta: `${vaultRisk}`,
        chain: utils.formatChain(formatImpermaxURLChain(chain)),
        project: 'impermax-v3',
        symbol: underlying.symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [underlying.id],
        url: `https://app.impermax.finance/vaults/${formatImpermaxURLChain(chain)}/${id}`,
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
};
