const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const {
  MARKETS,
  CHAINLINK_FEEDS,
  TOKEN_CHAINLINK_FEED_MAP,
  UNDERLYING_ASSET_DISPLAY,
  UNDERLYING_ASSETS,
} = require('./config');

/**
 * Harbor Adapter
 *
 * Harbor Finance synthetic assets (haTOKENS) with stability pool yield from reward streaming.
 * Supports multiple chains; pools are keyed by chain + pegged token address.
 *
 * Documentation: https://docs.harborfinance.io/
 */

const CHAINLINK_DECIMALS_ABI = [
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
];

const STABILITY_POOL_ABI = [
  {
    name: 'totalAssets',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'totalAssetSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'activeRewardTokens',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    name: 'rewardData',
    type: 'function',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'lastUpdate', type: 'uint256' },
      { name: 'finishAt', type: 'uint256' },
      { name: 'rate', type: 'uint256' },
      { name: 'queued', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
];

const ERC20_ABI = [
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
];

const MINTER_ABI = [
  {
    name: 'peggedTokenPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

const CHAINLINK_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
  },
];

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const activeMarkets = MARKETS.filter((m) => m.enabled !== false);

async function getChainlinkFeedPriceUsd(chain, feedKey) {
  const feeds = CHAINLINK_FEEDS[chain];
  const feedAddress = feeds?.[feedKey];
  if (!feedAddress) {
    throw new Error(`No Chainlink feed ${feedKey} on ${chain}`);
  }

  const [priceResult, decimalsResult] = await Promise.all([
    sdk.api.abi.call({
      target: feedAddress,
      abi: CHAINLINK_ABI.find((m) => m.name === 'latestRoundData'),
      chain,
    }),
    sdk.api.abi.call({
      target: feedAddress,
      abi: CHAINLINK_DECIMALS_ABI.find((m) => m.name === 'decimals'),
      chain,
    }).catch(() => ({ output: 8 })),
  ]);

  const answer = Number(priceResult?.output?.[1] ?? priceResult?.output?.answer ?? 0);
  const decimals = Number(decimalsResult?.output ?? 8);
  if (!answer) return 0;
  return answer / 10 ** decimals;
}

/**
 * Collateral/USD price — mirrors harbor-price-aggregators composite feeds where needed.
 */
async function getCollateralUsdPrice(chain, feedKey) {
  const feeds = CHAINLINK_FEEDS[chain];
  if (!feeds) throw new Error(`Unsupported chain: ${chain}`);

  if (feedKey === 'STETH_USD' && chain === 'megaeth') {
    const [stethEth, ethUsd] = await Promise.all([
      getChainlinkFeedPriceUsd(chain, 'STETH_ETH'),
      getChainlinkFeedPriceUsd(chain, 'ETH_USD'),
    ]);
    return stethEth * ethUsd;
  }

  if (feedKey === 'WBTC_USD' && chain === 'ethereum') {
    const [wbtcBtc, btcUsd] = await Promise.all([
      getChainlinkFeedPriceUsd(chain, 'WBTC_BTC'),
      getChainlinkFeedPriceUsd(chain, 'BTC_USD'),
    ]);
    return wbtcBtc * btcUsd;
  }

  return getChainlinkFeedPriceUsd(chain, feedKey);
}

async function calculateAPRFromRewards(poolAddress, poolTVLUsd, chain) {
  try {
    const activeRewardTokensResult = await sdk.api.abi.call({
      target: poolAddress,
      abi: STABILITY_POOL_ABI.find((m) => m.name === 'activeRewardTokens'),
      chain,
    });

    const rewardTokenAddresses = activeRewardTokensResult?.output || [];

    if (rewardTokenAddresses.length === 0 || poolTVLUsd === 0) {
      return 0;
    }

    let totalAPR = 0;

    for (const rewardTokenAddress of rewardTokenAddresses) {
      try {
        const rewardDataResult = await sdk.api.abi.call({
          target: poolAddress,
          abi: STABILITY_POOL_ABI.find((m) => m.name === 'rewardData'),
          params: [rewardTokenAddress],
          chain,
        });

        if (!rewardDataResult?.output) continue;

        const rewardRateBigInt = BigInt(rewardDataResult.output[2] || 0);
        const finishAt = Number(rewardDataResult.output[1] || 0);
        const currentTime = Math.floor(Date.now() / 1000);

        if (finishAt > 0 && currentTime > finishAt) continue;
        if (rewardRateBigInt === 0n) continue;

        const rewardRate = new BigNumber(rewardRateBigInt.toString());

        let rewardTokenDecimals = 18;
        try {
          const decimalsResult = await sdk.api.abi.call({
            target: rewardTokenAddress,
            abi: ERC20_ABI.find((m) => m.name === 'decimals'),
            chain,
          });
          rewardTokenDecimals = Number(decimalsResult?.output || 18);
        } catch (error) {
          console.warn(`Failed to fetch decimals for reward token ${rewardTokenAddress}, using default 18`);
        }

        let rewardTokenPrice = 0;
        try {
          const priceResponse = await axios.get(
            `https://coins.llama.fi/prices/current/${chain}:${rewardTokenAddress}`,
            { timeout: 10000 }
          );
          const priceKey = Object.keys(priceResponse.data.coins || {}).find(
            (key) => key.toLowerCase() === `${chain}:${rewardTokenAddress.toLowerCase()}`
          );
          rewardTokenPrice = priceResponse.data.coins[priceKey]?.price || 0;
        } catch (error) {
          continue;
        }

        if (rewardTokenPrice === 0) continue;

        const rewardTokensPerSecond = rewardRate.dividedBy(10 ** rewardTokenDecimals);
        const rewardTokensPerYear = rewardTokensPerSecond.multipliedBy(SECONDS_PER_YEAR);
        const rewardValuePerYearUSD = rewardTokensPerYear.multipliedBy(rewardTokenPrice);
        const tokenAPR = rewardValuePerYearUSD.dividedBy(poolTVLUsd).multipliedBy(100).toNumber();
        totalAPR += tokenAPR;
      } catch (error) {
        continue;
      }
    }

    return totalAPR;
  } catch (error) {
    console.error(`Error calculating APR from rewards for pool ${poolAddress}:`, error.message);
    return 0;
  }
}

async function fetchPoolsFromChain() {
  const marketsByChainToken = {};
  for (const market of activeMarkets) {
    const groupKey = `${market.chain}:${market.peggedTokenSymbol}`;
    if (!marketsByChainToken[groupKey]) {
      marketsByChainToken[groupKey] = [];
    }
    marketsByChainToken[groupKey].push(market);
  }

  const pools = [];

  for (const [groupKey, tokenMarkets] of Object.entries(marketsByChainToken)) {
    const { chain, peggedTokenSymbol } = tokenMarkets[0];
    const peggedTokenAddress = tokenMarkets[0].peggedTokenAddress;

    const allAPRs = [];
    let totalTVL = 0;

    try {
      let peggedTokenPriceInUnderlying = 0;
      let underlyingAssetPriceUSD = 0;
      let decimals = 18;

      const defaultFeedKey = TOKEN_CHAINLINK_FEED_MAP[peggedTokenSymbol];
      if (!defaultFeedKey) {
        throw new Error(
          `Unsupported pegged token symbol: ${peggedTokenSymbol}. Supported: ${Object.keys(TOKEN_CHAINLINK_FEED_MAP).join(', ')}`
        );
      }

      let pricingMarket = tokenMarkets.find(
        (m) => m.minterAddress && m.collateralPriceFeed
      );

      if (pricingMarket) {
        try {
          const minterPriceResult = await sdk.api.abi.call({
            target: pricingMarket.minterAddress,
            abi: MINTER_ABI.find((m) => m.name === 'peggedTokenPrice'),
            chain,
          });
          if (minterPriceResult?.output) {
            peggedTokenPriceInUnderlying = Number(minterPriceResult.output) / 1e18;
            console.log(
              `  [${chain}] peggedTokenPrice from ${pricingMarket.marketLabel || 'market'} minter: ${peggedTokenPriceInUnderlying.toFixed(6)} ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'collateral units'}`
            );
          }
        } catch (error) {
          pricingMarket = null;
        }
      }

      if (peggedTokenPriceInUnderlying === 0) {
        for (const market of tokenMarkets) {
          if (!market.minterAddress) continue;
          try {
            const minterPriceResult = await sdk.api.abi.call({
              target: market.minterAddress,
              abi: MINTER_ABI.find((m) => m.name === 'peggedTokenPrice'),
              chain,
            });
            if (minterPriceResult?.output) {
              peggedTokenPriceInUnderlying = Number(minterPriceResult.output) / 1e18;
              pricingMarket = market;
              console.log(
                `  [${chain}] peggedTokenPrice from ${market.marketLabel || 'market'} minter: ${peggedTokenPriceInUnderlying.toFixed(6)} ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'collateral units'}`
              );
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }

      if (peggedTokenPriceInUnderlying === 0) {
        peggedTokenPriceInUnderlying = 1;
        console.log(
          `  [${chain}] Using default peg ratio: 1.0 ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'UNDERLYING'}`
        );
      }

      const priceFeedKey =
        pricingMarket?.collateralPriceFeed ||
        tokenMarkets.find((m) => m.collateralPriceFeed)?.collateralPriceFeed ||
        defaultFeedKey;

      try {
        underlyingAssetPriceUSD = await getCollateralUsdPrice(chain, priceFeedKey);
        if (underlyingAssetPriceUSD > 0) {
          console.log(
            `  [${chain}] ${priceFeedKey} price in USD: $${underlyingAssetPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          );
        }
      } catch (error) {
        console.log(`  [${chain}] Failed to get ${priceFeedKey} price:`, error.message);
      }

      const peggedTokenPriceUSD = peggedTokenPriceInUnderlying * underlyingAssetPriceUSD;
      if (peggedTokenPriceUSD > 0) {
        console.log(
          `  [${chain}] Final ${peggedTokenSymbol} price: $${peggedTokenPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        );
      }

      try {
        const decimalsResult = await sdk.api.abi.call({
          target: peggedTokenAddress,
          abi: ERC20_ABI.find((m) => m.name === 'decimals'),
          chain,
        });
        decimals = Number(decimalsResult?.output || 18);
      } catch (error) {
        console.log(`  [${chain}] Decimals lookup failed, using default 18`);
      }

      for (const market of tokenMarkets) {
        const { collateralPoolAddress, sailPoolAddress, marketLabel } = market;

        try {
          console.log(
            `  [${chain}] ${peggedTokenSymbol} ${marketLabel || ''} - Collateral: ${collateralPoolAddress}, Sail: ${sailPoolAddress}`
          );

          const [collateralTVLResult, sailTVLResult] = await Promise.all([
            sdk.api.abi.call({
              target: collateralPoolAddress,
              abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssets'),
              chain,
            }).catch(() =>
              sdk.api.abi.call({
                target: collateralPoolAddress,
                abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssetSupply'),
                chain,
              })
            ),
            sailPoolAddress
              ? sdk.api.abi.call({
                  target: sailPoolAddress,
                  abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssets'),
                  chain,
                }).catch(() =>
                  sdk.api.abi.call({
                    target: sailPoolAddress,
                    abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssetSupply'),
                    chain,
                  })
                )
              : Promise.resolve({ output: null }),
          ]);

          const collateralTVLRaw = BigInt(collateralTVLResult?.output || 0);
          const sailTVLRaw = BigInt(sailTVLResult?.output || 0);

          const collateralTVLTokensBN = new BigNumber(collateralTVLRaw.toString()).dividedBy(10 ** decimals);
          const sailTVLTokensBN = new BigNumber(sailTVLRaw.toString()).dividedBy(10 ** decimals);

          const collateralTVLTokens = collateralTVLTokensBN.toNumber();
          const sailTVLTokens = sailTVLTokensBN.toNumber();
          const collateralTVLUsd = collateralTVLTokens * peggedTokenPriceUSD;
          const sailTVLUsd = sailTVLTokens * peggedTokenPriceUSD;

          let collateralAPR = 0;
          let sailAPR = 0;

          if (collateralTVLUsd > 0) {
            collateralAPR = await calculateAPRFromRewards(collateralPoolAddress, collateralTVLUsd, chain);
          }

          if (sailTVLUsd > 0 && sailPoolAddress) {
            sailAPR = await calculateAPRFromRewards(sailPoolAddress, sailTVLUsd, chain);
          }

          const totalTVLRawBN = new BigNumber(collateralTVLRaw.toString()).plus(sailTVLRaw.toString());
          const marketTVLTokensBN = totalTVLRawBN.dividedBy(10 ** decimals);
          const marketTVLTokens = marketTVLTokensBN.toNumber();
          const marketTVLUsd = marketTVLTokens * peggedTokenPriceUSD;
          totalTVL += marketTVLUsd;

          const marketAPRs = [];
          if (collateralTVLUsd > 0) marketAPRs.push(collateralAPR);
          if (sailPoolAddress && sailTVLUsd > 0) marketAPRs.push(sailAPR);

          const marketAPR = marketAPRs.length > 0 ? Math.min(...marketAPRs) : 0;

          if (marketTVLUsd > 0) allAPRs.push(marketAPR);

          console.log(
            `    Market TVL: ${marketTVLTokens.toFixed(6)} haTokens = $${marketTVLUsd.toFixed(2)} USD`
          );
          console.log(
            `    - Collateral: ${collateralTVLTokens.toFixed(6)} ($${collateralTVLUsd.toFixed(2)})${collateralAPR > 0 ? ` APR ${collateralAPR.toFixed(2)}%` : ''}`
          );
          console.log(
            `    - Sail: ${sailTVLTokens.toFixed(6)} ($${sailTVLUsd.toFixed(2)})${sailAPR > 0 ? ` APR ${sailAPR.toFixed(2)}%` : ''}`
          );
        } catch (error) {
          console.error(`  Error fetching ${peggedTokenSymbol} market on ${chain}:`, error.message || error);
        }
      }

      const validAPRs = allAPRs.filter((apr) => Number.isFinite(apr));
      const finalAPR = validAPRs.length > 0 ? Math.min(...validAPRs) : 0;

      console.log(`\n[${chain}] ${peggedTokenSymbol} Summary:`);
      console.log(`  Total TVL: $${totalTVL.toFixed(2)}`);
      console.log(`  Final APR: ${finalAPR.toFixed(2)}% (from ${validAPRs.length} market(s))`);

      if (totalTVL >= 10000) {
        const underlying =
          UNDERLYING_ASSETS[chain]?.[peggedTokenSymbol] || peggedTokenAddress;
        const marketLabels = [...new Set(tokenMarkets.map((m) => m.marketLabel).filter(Boolean))];
        const poolMetaSuffix = marketLabels.length ? ` (${marketLabels.join(', ')})` : '';

        pools.push({
          pool: `${peggedTokenAddress}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: 'harbor',
          symbol: peggedTokenSymbol,
          tvlUsd: totalTVL,
          apyBase: validAPRs.length > 0 ? finalAPR : 0,
          underlyingTokens: [underlying],
          poolMeta: `${peggedTokenSymbol} Stability Pool${poolMetaSuffix}`,
          url: 'https://app.harborfinance.io/anchor',
        });
        console.log(`  ✅ Added pool for ${peggedTokenSymbol} on ${chain}`);
      } else if (totalTVL > 0 && totalTVL < 10000) {
        console.log(`  ⚠️  Skipping ${peggedTokenSymbol} on ${chain} - TVL below $10k`);
      } else {
        console.log(`  ⚠️  Skipping ${peggedTokenSymbol} on ${chain} - no TVL`);
      }
    } catch (error) {
      console.error(`Error processing ${groupKey}:`, error);
    }
  }

  return pools;
}

const apy = async () => {
  const pools = await fetchPoolsFromChain();
  return pools.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harborfinance.io/anchor',
};
