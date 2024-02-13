const { request, gql } = require('graphql-request');
const utils = require('../utils');
const superagent = require('superagent');

// Token constants
const tokens = {
  SWISE: {
    decimals: 18,
    symbol: 'SWISE',
    address: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
  },
  USDC: {
    decimals: 6,
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  wstETH: {
    decimals: 18,
    symbol: 'wstETH',
    address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
  },
  MORPHO: {
    decimals: 18,
    symbol: 'MORPHO',
    address: '0x9994E35Db50125E0DF82e4c2dde62496CE330999',
  },
};

const tokenDecimals = Object.fromEntries(
  Object.values(tokens).map(({ address, decimals }) => [
    address.toLowerCase(),
    decimals,
  ])
);

const SECONDS_PER_YEAR = 3600 * 24 * 365;
const subgraphUrls = {
  morphoBlue:
    'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue',
  morphoBlueRewards:
    'https://api.thegraph.com/subgraphs/name/morpho-association/morpho-blue-rewards',
};

const gqlQueries = {
  yieldsData: gql`
    query GetYieldsData {
      markets(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc) {
        id
        lltv
        borrowedToken {
          id
          symbol
          lastPriceUSD
          decimals
        }
        inputToken {
          id
          lastPriceUSD
          decimals
        }
        rates {
          side
          rate
        }
        totalSupply
        totalBorrow
        totalCollateral
      }
    }
  `,
  rewardsData: gql`
    query GetRewardsData {
      markets {
        id
        totalCollateral
        totalSupplyShares
        totalBorrowShares
        rewardsRates {
          id
          supplyRatePerYear
          borrowRatePerYear
          collateralRatePerYear
          rewardProgram {
            id
            sender {
              id
            }
            urd {
              id
            }
            rewardToken
          }
        }
      }
    }
  `,
};

async function fetchPrices(addresses) {
  try {
    const url = `https://coins.llama.fi/prices/current/${addresses
      .join(',')
      .toLowerCase()}`;
    const response = await superagent.get(url);
    return Object.entries(response.body.coins).reduce(
      (acc, [name, price]) => ({
        ...acc,
        [name.split(':')[1]]: price.price,
      }),
      {}
    );
  } catch (error) {
    console.error('Error fetching prices:', error);
    return {};
  }
}

function rateToApy(ratePerYear) {
  return Math.expm1(ratePerYear);
}

function calculateReward(
  ratePerYear,
  priceTokenUSD,
  tokenDecimals,
  totalAssets,
  assetPriceUSD,
  assetDecimal
) {
  if (ratePerYear > 0 && priceTokenUSD && tokenDecimals !== undefined) {
    const numerator = (ratePerYear * priceTokenUSD) / 10 ** tokenDecimals;
    const denom = (totalAssets * assetPriceUSD) / 10 ** assetDecimal;
    return denom > 0 ? numerator / denom : 0;
  }
  return 0;
}

async function fetchGraphData(query, url) {
  try {
    return await request(url, query);
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return {};
  }
}

async function apy() {
  try {
    const marketDataResponse = await fetchGraphData(
      gqlQueries.yieldsData,
      subgraphUrls.morphoBlue
    );
    const rewardsDataResponse = await fetchGraphData(
      gqlQueries.rewardsData,
      subgraphUrls.morphoBlueRewards
    );
    const marketData = marketDataResponse?.markets || [];
    const rewardsData = rewardsDataResponse?.markets || [];

    const tokenAddresses = Object.values(tokens).map(
      ({ address }) => `ethereum:${address}`
    );
    const prices = await fetchPrices(tokenAddresses);

    // Map for quick access to rewards data by market ID
    const rewardsDataMap = rewardsData.reduce((acc, market) => {
      acc[market.id] = market;
      return acc;
    }, {});

    return marketData.map((market) => {
      const marketRewards = rewardsDataMap[market.id] || { rewardsRates: [] };
      const rewardTokenStates = {
        hasSWISEReward: false,
        hasUSDCReward: false,
        hasWstETHReward: false,
        hasMorphoReward: false,
      };

      // Check and set flags for each reward token presence
      marketRewards.rewardsRates.forEach(({ rewardProgram }) => {
        const rewardTokenAddress = rewardProgram.rewardToken.toLowerCase();
        if (rewardTokenAddress === tokens.SWISE.address.toLowerCase())
          rewardTokenStates.hasSWISEReward = true;
        if (rewardTokenAddress === tokens.USDC.address.toLowerCase())
          rewardTokenStates.hasUSDCReward = true;
        if (rewardTokenAddress === tokens.wstETH.address.toLowerCase())
          rewardTokenStates.hasWstETHReward = true;
        if (rewardTokenAddress === tokens.MORPHO.address.toLowerCase())
          rewardTokenStates.hasMorphoReward = true;
      });

      // Calculate APYs for supply, borrow, and collateral based on rewards
      let supplyRewardsApy = 0;
      let borrowRewardsApy = 0;
      let collateralRewardsApy = 0;

      marketRewards.rewardsRates.forEach((reward) => {
        const {
          supplyRatePerYear,
          borrowRatePerYear,
          collateralRatePerYear,
          rewardProgram,
        } = reward;
        const rewardTokenAddress = rewardProgram.rewardToken.toLowerCase();
        const rewardTokenPriceUSD = prices[rewardTokenAddress] || 0;
        const rewardTokenDecimals = tokenDecimals[rewardTokenAddress];

        supplyRewardsApy +=
          calculateReward(
            supplyRatePerYear,
            rewardTokenPriceUSD,
            rewardTokenDecimals,
            market.totalSupply,
            market.borrowedToken.lastPriceUSD,
            market.borrowedToken.decimals
          ) * 100;

        borrowRewardsApy +=
          calculateReward(
            borrowRatePerYear,
            rewardTokenPriceUSD,
            rewardTokenDecimals,
            market.totalBorrow,
            market.borrowedToken.lastPriceUSD,
            market.borrowedToken.decimals
          ) * 100;

        collateralRewardsApy +=
          calculateReward(
            collateralRatePerYear,
            rewardTokenPriceUSD,
            rewardTokenDecimals,
            market.totalCollateral,
            market.inputToken.lastPriceUSD,
            market.inputToken.decimals
          ) * 100;
      });

      // Construct reward tokens array based on flags
      const rewardTokens = [
        rewardTokenStates.hasMorphoReward ? tokens.MORPHO.address : null,
        rewardTokenStates.hasWstETHReward ? tokens.wstETH.address : null,
        rewardTokenStates.hasUSDCReward ? tokens.USDC.address : null,
        rewardTokenStates.hasSWISEReward ? tokens.SWISE.address : null,
      ].filter(Boolean);

      // Calculate total TVL, supply, and borrow in USD
      const totalSupplyUsd =
        (market.totalSupply * market.borrowedToken.lastPriceUSD) /
          10 ** market.borrowedToken.decimals +
        (market.totalCollateral * market.inputToken.lastPriceUSD) /
          10 ** market.inputToken.decimals;
      const totalBorrowUsd =
        (market.totalBorrow * market.borrowedToken.lastPriceUSD) /
        10 ** market.borrowedToken.decimals;
      const totalTVL = totalSupplyUsd - totalBorrowUsd;

      // Return structured APY data for each market
      return {
        pool: `morpho-blue-${market.id}`,
        chain: 'ethereum',
        project: 'morpho-blue',
        symbol: utils.formatSymbol(market.borrowedToken.symbol),
        apyBase:
          rateToApy(
            market.rates.find((rate) => rate.side === 'LENDER')?.rate || 0
          ) * 100,
        apyReward: supplyRewardsApy,
        rewardTokens,
        tvlUsd: totalTVL,
        underlyingTokens: [market.borrowedToken.id],
        apyBaseBorrow:
          rateToApy(
            market.rates.find((rate) => rate.side === 'BORROWER')?.rate || 0
          ) * 100,
        apyRewardBorrow: borrowRewardsApy + collateralRewardsApy,
        totalSupplyUsd,
        totalBorrowUsd,
        ltv: market.lltv / 1e18,
      };
    });
  } catch (error) {
    console.error('Error in calculateApy:', error);
    return [];
  }
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.morpho.xyz',
};
