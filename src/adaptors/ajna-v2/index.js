const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { factoryAbi, poolAbi, poolInfoUtilsAbi } = require('./abi');

// Known token symbols for tokens with non-standard symbol() implementations
// Keys must be lowercase for consistent lookups
const knownSymbols = {
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': 'MKR', // MKR returns bytes32
};

const config = {
  ethereum: {
    factory: '0x6146DD43C5622bB6D12A5240ab9CF4de14eDC625',
    poolInfoUtils: '0x30c5eF2997d6a882DE52c4ec01B6D0a5e5B4fAAE',
  },
  arbitrum: {
    factory: '0xA3A1e968Bd6C578205E11256c8e6929f21742aAF',
    poolInfoUtils: '0x8a7F5aFb7E3c3fD1f3Cc9D874b454b6De11EBbC9',
  },
  base: {
    factory: '0x214f62B5836D83f3D6c4f71F174209097B1A779C',
    poolInfoUtils: '0x97fa9b0909C238D170C1ab3B5c728A3a45BBEcBa',
  },
  optimism: {
    factory: '0x609C4e8804fafC07c96bE81A8a98d0AdCf2b7Dfa',
    poolInfoUtils: '0xdE6C8171b5b971F71C405631f4e0568ed8491aaC',
  },
  hemi: {
    factory: '0xE47b3D287Fc485A75146A59d459EC8CD0F8E5021',
    poolInfoUtils: '0xab57F608c37879360D622C32C6eF3BBa79AA667D',
  },
};

const getPoolsForChain = async (chain) => {
  try {
    const { factory, poolInfoUtils } = config[chain];

    // Get all deployed pools
    const poolsResult = await sdk.api.abi.call({
      target: factory,
      abi: factoryAbi.find((m) => m.name === 'getDeployedPoolsList'),
      chain,
    });

    const pools = poolsResult.output;
    if (!pools || pools.length === 0) return [];

    // Get quote token addresses (permitFailure to handle RPC issues)
    const quoteTokens = (
      await sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: poolAbi.find((m) => m.name === 'quoteTokenAddress'),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    // Get collateral token addresses (permitFailure to handle RPC issues)
    const collateralTokens = (
      await sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: poolAbi.find((m) => m.name === 'collateralAddress'),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    // Get interest rate info (permitFailure to handle RPC issues)
    const interestRates = (
      await sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: poolAbi.find((m) => m.name === 'interestRateInfo'),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    // Get debt info for borrow amounts (permitFailure to handle RPC issues)
    const debtInfos = (
      await sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: poolAbi.find((m) => m.name === 'debtInfo'),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    // Get pool loans info for TVL (permitFailure to handle RPC issues)
    const poolLoansInfos = (
      await sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({
          target: poolInfoUtils,
          params: [pool],
        })),
        abi: poolInfoUtilsAbi.find((m) => m.name === 'poolLoansInfo'),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    // Build list of valid token addresses for symbol lookups (filter out nulls)
    const validQuoteTokens = quoteTokens.filter(Boolean);
    const validCollateralTokens = collateralTokens.filter(Boolean);

    // Get token symbols (with permitFailure for non-standard tokens like MKR)
    const quoteSymbolsResult = await sdk.api.abi.multiCall({
      calls: validQuoteTokens.map((token) => ({ target: token })),
      abi: 'erc20:symbol',
      chain,
      permitFailure: true,
    });
    // Map back to original indices
    const quoteSymbolsMap = {};
    let validIdx = 0;
    for (let i = 0; i < quoteTokens.length; i++) {
      if (quoteTokens[i]) {
        const result = quoteSymbolsResult.output[validIdx];
        quoteSymbolsMap[i] = result?.output || knownSymbols[quoteTokens[i].toLowerCase()] || null;
        validIdx++;
      } else {
        quoteSymbolsMap[i] = null;
      }
    }
    const quoteSymbols = quoteTokens.map((_, i) => quoteSymbolsMap[i]);

    const collateralSymbolsResult = await sdk.api.abi.multiCall({
      calls: validCollateralTokens.map((token) => ({ target: token })),
      abi: 'erc20:symbol',
      chain,
      permitFailure: true,
    });
    // Map back to original indices
    const collateralSymbolsMap = {};
    validIdx = 0;
    for (let i = 0; i < collateralTokens.length; i++) {
      if (collateralTokens[i]) {
        const result = collateralSymbolsResult.output[validIdx];
        collateralSymbolsMap[i] = result?.output || knownSymbols[collateralTokens[i].toLowerCase()] || null;
        validIdx++;
      } else {
        collateralSymbolsMap[i] = null;
      }
    }
    const collateralSymbols = collateralTokens.map((_, i) => collateralSymbolsMap[i]);

    // Get prices in batches to avoid 413 errors
    const uniqueTokens = [
      ...new Set([...quoteTokens, ...collateralTokens].filter(Boolean)),
    ];

    const chunkSize = 50;
    const prices = {};
    for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
      const chunk = uniqueTokens.slice(i, i + chunkSize);
      const priceKeys = chunk.map((t) => `${chain}:${t}`).join(',');
      const response = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKeys}`
      );
      Object.assign(prices, response.data.coins);
    }

    const poolData = [];
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const quoteToken = quoteTokens[i];
      const collateralToken = collateralTokens[i];
      const quoteSymbol = quoteSymbols[i];
      const collateralSymbol = collateralSymbols[i];
      const interestRate = interestRates[i];
      const debtInfo = debtInfos[i];

      if (!quoteToken || !collateralToken || !quoteSymbol || !collateralSymbol) {
        continue;
      }

      const quotePrice = prices[`${chain}:${quoteToken}`]?.price;
      if (!quotePrice) continue;

      const poolLoansInfo = poolLoansInfos[i];

      // Total borrowed (debt) - in WAD format (18 decimals)
      const totalDebt = debtInfo ? debtInfo.debt_ / 10 ** 18 : 0;
      const totalBorrowUsd = totalDebt * quotePrice;

      // Total supply from Ajna's internal accounting - poolSize_ is in WAD format
      const poolSize = poolLoansInfo ? poolLoansInfo.poolSize_ / 10 ** 18 : 0;
      const totalSupplyUsd = poolSize * quotePrice;

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      // Skip pools with very low TVL
      if (tvlUsd < 1000) continue;

      // Interest rate is in WAD (18 decimals), annualized
      // ~90% goes to lenders (10% to reserves)
      const annualizedRate = interestRate ? interestRate.interestRate_ / 1e18 : 0;
      const apyBase = annualizedRate * 100 * 0.9; // Lender rate
      const apyBaseBorrow = annualizedRate * 100;

      const symbol = `${quoteSymbol}-${collateralSymbol}`;

      poolData.push({
        pool: `${pool}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'ajna-v2',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        underlyingTokens: [quoteToken],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        poolMeta: `${collateralSymbol} collateral`,
        url: `https://ajnafi.com/${chain}/pools/${pool}`,
      });
    }

    return poolData;
  } catch (err) {
    console.error(`Error fetching pools for ${chain}:`, err.message);
    return [];
  }
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(config).map((chain) => getPoolsForChain(chain))
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://ajnafi.com/',
};
