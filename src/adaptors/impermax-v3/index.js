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
  arbitrum: ["https://arbitrum-factory-v3-production.up.railway.app/"],
  base: ["https://base-factory-v3-production.up.railway.app/"]
};

const lendingVaultsConfig = {
  polygon: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-polygon/v0.0.2',
  ],
  arbitrum: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-arbitrum/v0.0.3',
  ],
  base: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-base/v0.0.3',
  ],
  scroll: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-scroll/v0.0.2',
  ],
  real: [],
  fantom: [],
  optimism: [],
  ethereum: [],
  blast: [
    'https://api.studio.thegraph.com/query/46041/lending-vault-blast/v0.0.2',
  ],
  sonic: ['https://api.studio.thegraph.com/query/46041/lending-vault-sonic/v0.0.2'],
};

// NFTLP factory address
const projectPoolFactories = {
  arbitrum: {
    UniswapV3: ['0x4936b5aafe83611aa2fa926a683973ddb48ce7f1'],
  },
  base: { 
    UniswapV3: ['0xe5d6cf969c01bf8d6c46840ed784d7f209038d7a']
  }
};

// Only list balanced/aggressive vaults as default is conservative
const lendingVaultProfiles = {
  arbitrum: [],
  polygon: [],
  scroll: [],
  base: [
    {
      address: "0xaD9cfEBB7666f2698cA9d836eD8CBeb0545a4263".toLowerCase(),
      risk: "Aggressive",
    },
  ],
  blast: [
    {
      address: "0xFBFBd1c9E05c114684Bc447Da5182Fe09315E038".toLowerCase(),
      risk: "Balanced",
    }, // ETH
  ],
  sonic: [
    {
      address: "0x49967493310250254Aee27F0AbD2C97b45cb1509".toLowerCase(),
      risk: "Balanced",
    }, // ws
    {
      address: "0xDD8761dec5dF366a6AF7fE4E15b8f3888c0a905c".toLowerCase(),
      risk: "Balanced",
    }, // usdc.e
    {
      address: "0x835dA504bEfedC85404ad6A11df278049bc56d12".toLowerCase(),
      risk: "Balanced",
    }, // weth
  ],
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
    const queryResult = await request(url, vaultGraphQuery);
    allLendingVaults = allLendingVaults.concat(queryResult.lendingVaults);
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
  logger.info(`Getting ${tokenAddresses.length} tokens from gecko on ${chain}`);
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
    logger.error(`Gecko prices fail on ${chain}:`, error.message);
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
        chain,
        project: 'impermax-v3',
        symbol: underlying.symbol,
        tvlUsd: tvlUsd.toNumber(),
        totalBorrowUsd: totalBorrowsUsd.toNumber(),
        totalSupplyUsd: totalSupplyUsd.toNumber(),
        apyBase: supplyApr.toNumber(),
        apyBaseBorrow: borrowApr.toNumber(),
        underlyingTokens: [token0.id, token1.id],
        ltv: Number(ltv.toFixed(3)),
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
      const vaultRisk = chainVaults.find((v) => v?.address.toLowerCase() === id.toLowerCase())?.risk ?? "Conservative";

      pools.push({
        pool: `${id}-${underlying.symbol}-${chain}`.toLowerCase(),
        poolMeta: `${vaultRisk}`,
        chain,
        project: 'impermax-v3',
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
