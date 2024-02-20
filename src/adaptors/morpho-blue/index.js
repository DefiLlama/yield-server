const { request, gql } = require('graphql-request');
const utils = require('../utils');
const superagent = require('superagent');

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
          symbol
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
  metaMorphoData: gql`
    query GetMetaMorphoData {
      metaMorphos(first: 1000, orderBy: lastTotalAssets, orderDirection: desc) {
        id
        name
        symbol
        decimals
        asset {
          id
        }
        fee
        feeRecipient {
          id
        }
        lastTotalAssets
        asset {
          id
        }
        withdrawQueue {
          market {
            id
            totalSupply
            borrowedToken {
              id
              decimals
              lastPriceUSD
            }
          }
        }
      }
    }
  `,
};

const WAD = BigInt(1e18);

const wadDivUp = (x, other) => {
  return mulDivUp(x, WAD, other);
};

const mulDivUp = (x, y, scale) => {
  if (x === 0n || y === 0n) return 0n;

  return (x * y + scale - 1n) / scale;
};

const wadMulDown = (x, other) => {
  return mulDivDown(x, other, WAD);
};

const mulDivDown = (x, y, scale) => {
  if (x === 0n || y === 0n) return 0n;
  return (x * y) / scale;
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
  assetDecimals
) {
  if (ratePerYear > 0 && priceTokenUSD && tokenDecimals !== undefined) {
    const numerator = (ratePerYear * priceTokenUSD) / 10 ** tokenDecimals;
    const denom = (totalAssets * assetPriceUSD) / 10 ** assetDecimals;
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

async function blueMarkets() {
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

    return Object.fromEntries(
      marketData.map((market) => {
        const marketRewards = rewardsDataMap[market.id] || { rewardsRates: [] };
        const rewardTokenStates = {
          hasSWISEReward: false,
          hasUSDCReward: false,
          hasWstETHReward: false,
          hasMorphoReward: false,
        };
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
          // Check and set flags for reward token presence
          if (rewardTokenAddress === tokens.SWISE.address.toLowerCase())
            rewardTokenStates.hasSWISEReward = true;
          if (rewardTokenAddress === tokens.USDC.address.toLowerCase())
            rewardTokenStates.hasUSDCReward = true;
          if (rewardTokenAddress === tokens.wstETH.address.toLowerCase())
            rewardTokenStates.hasWstETHReward = true;
          if (rewardTokenAddress === tokens.MORPHO.address.toLowerCase())
            rewardTokenStates.hasMorphoReward = true;

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
        const ltv = market.lltv / 1e18;

        // Return structured APY data for each market
        return [
          market.id,
          {
            pool: `morpho-blue-${market.id}`,
            chain: 'ethereum',
            project: 'morpho-blue',
            symbol: utils.formatSymbol(
              `${market.inputToken.symbol}-${market.borrowedToken.symbol}`
            ),
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
            ltv,
            poolMeta: `${ltv * 100}%`,
          },
        ];
      })
    );
  } catch (error) {
    console.error('Error in blueMarkets:', error);
    return [];
  }
}

// note that for this section, the use of bigint and scale_factor (WAD) was necessary to avoid rounding errors in the apy calculation.
async function metaMorphoAPY(resultsOriginal) {
  try {
    const metaMorphoDataResponse = await fetchGraphData(
      gqlQueries.metaMorphoData,
      subgraphUrls.morphoBlue
    );
    const vaultData = metaMorphoDataResponse?.metaMorphos || [];

    const marketDataMap = Object.entries(resultsOriginal).reduce(
      (acc, [marketId, marketInfo]) => {
        acc[marketId] = marketInfo;
        return acc;
      },
      {}
    );

    return vaultData.map((vault) => {
      let totalMarketSupply = BigInt(0);
      let rewardTokenSet = new Set();
      const vaultTotalAssets = BigInt(vault.lastTotalAssets);

      vault.withdrawQueue.forEach(({ market }) => {
        const marketInfo = marketDataMap[market.id];
        if (marketInfo) {
          totalMarketSupply += BigInt(market.totalSupply) * WAD;
        }
      });

      let weightedApyBase = BigInt(0);
      let weightedApyRewards = BigInt(0);

      // Calculate weighted APYs for the vault
      vault.withdrawQueue.forEach(({ market }) => {
        const marketInfo = marketDataMap[market.id];
        if (marketInfo) {
          marketInfo.rewardTokens.forEach((token) => rewardTokenSet.add(token));
          const marketSupply = BigInt(market.totalSupply) * WAD;
          const weight = wadDivUp(marketSupply, totalMarketSupply);
          weightedApyBase += wadMulDown(
            weight,
            BigInt(Math.round(marketInfo.apyBase * 1e18))
          );
          weightedApyRewards += wadMulDown(
            weight,
            BigInt(Math.round(marketInfo.apyReward * 1e18))
          );
        }
      });

      const finalApyBase = (Number(weightedApyBase) / Number(WAD)).toFixed(6);
      const finalApyRewards = (
        Number(weightedApyRewards) / Number(WAD)
      ).toFixed(6);

      let underlyingToken;
      let underlyingTokenDecimal;
      let lastPriceUSD;
      let totalSupplyUSD = 0;

      if (vault.withdrawQueue.length > 0) {
        underlyingToken = vault.withdrawQueue[0].market.borrowedToken.id;
        underlyingTokenDecimal =
          vault.withdrawQueue[0].market.borrowedToken.decimals;
        lastPriceUSD = vault.withdrawQueue[0].market.borrowedToken.lastPriceUSD;
        totalSupplyUSD =
          (parseFloat(vaultTotalAssets.toString()) * lastPriceUSD) /
          10 ** underlyingTokenDecimal;
      }

      return {
        pool: `morpho-blue-${vault.id}`,
        chain: 'ethereum',
        project: 'morpho-blue',
        symbol: utils.formatSymbol(vault.symbol),
        apyBase: parseFloat(finalApyBase),
        apyReward: parseFloat(finalApyRewards),
        rewardTokens: Array.from(rewardTokenSet),
        tvlUsd: Number.isFinite(totalSupplyUSD) ? totalSupplyUSD : 0,
        underlyingTokens: underlyingToken ? [underlyingToken] : [],
        apyBaseBorrow: 0,
        apyRewardBorrow: 0,
        totalSupplyUsd: Number.isFinite(totalSupplyUSD) ? totalSupplyUSD : 0,
        totalBorrowUsd: 0,
        ltv: 0,
      };
    });
  } catch (error) {
    console.error('Error in metaMorphoAPY:', error);
    return [];
  }
}

async function apy() {
  const resultsOriginal = await blueMarkets();
  const resultsMetamorpho = await metaMorphoAPY(resultsOriginal);
  return Object.values(resultsOriginal).concat(resultsMetamorpho);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.morpho.xyz',
};
