const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { factoryAbi, poolAbi, poolInfoUtilsAbi } = require('./abi');

// Known token symbols for tokens with non-standard symbol() implementations
const knownSymbols = {
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2': 'MKR', // MKR returns bytes32
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
  polygon: {
    factory: '0x1f172F881eBa06Aa7a991651780527C173783Cf6',
    poolInfoUtils: '0x519021054846cd3D9883359B593B5ED3058Fbe9f',
  },
  avax: {
    factory: '0x2aA2A6e6B4b20f496A4Ed65566a6FD13b1b8A17A',
    poolInfoUtils: '0x9e407019C07b50e8D7C2d0E2F796C4eCb0F485b3',
  },
  bsc: {
    factory: '0x86eE95085F204B525b590f21dec55e2373F6da69',
    poolInfoUtils: '0x81557781862D3e0FF7559080C2A9AE1F08Ee8421',
  },
  blast: {
    factory: '0xcfCB7fb8c13c7bEffC619c3413Ad349Cbc6D5c91',
    poolInfoUtils: '0x6aF0363e5d2ddab4471f31Fe2834145Aea1E55Ee',
  },
  linea: {
    factory: '0xd72A448C3BC8f47EAfFc2C88Cf9aC9423Bfb5067',
    poolInfoUtils: '0x3AFcEcB6A943746eccd72eb6801E534f8887eEA1',
  },
  mode: {
    factory: '0x62Cf5d9075D1d6540A6c7Fa836162F01a264115A',
    poolInfoUtils: '0x6EF483c3653907c19bDD4300087e481551880c60',
  },
};

const getPoolsForChain = async (chain) => {
  const { factory, poolInfoUtils } = config[chain];

  // Get all deployed pools
  const poolsResult = await sdk.api.abi.call({
    target: factory,
    abi: factoryAbi.find((m) => m.name === 'getDeployedPoolsList'),
    chain,
  });

  const pools = poolsResult.output;
  if (!pools || pools.length === 0) return [];

  // Get quote token addresses
  const quoteTokens = (
    await sdk.api.abi.multiCall({
      calls: pools.map((pool) => ({ target: pool })),
      abi: poolAbi.find((m) => m.name === 'quoteTokenAddress'),
      chain,
    })
  ).output.map((o) => o.output);

  // Get collateral token addresses
  const collateralTokens = (
    await sdk.api.abi.multiCall({
      calls: pools.map((pool) => ({ target: pool })),
      abi: poolAbi.find((m) => m.name === 'collateralAddress'),
      chain,
    })
  ).output.map((o) => o.output);

  // Get interest rate info
  const interestRates = (
    await sdk.api.abi.multiCall({
      calls: pools.map((pool) => ({ target: pool })),
      abi: poolAbi.find((m) => m.name === 'interestRateInfo'),
      chain,
    })
  ).output.map((o) => o.output);

  // Get debt info for borrow amounts
  const debtInfos = (
    await sdk.api.abi.multiCall({
      calls: pools.map((pool) => ({ target: pool })),
      abi: poolAbi.find((m) => m.name === 'debtInfo'),
      chain,
    })
  ).output.map((o) => o.output);

  // Get pool loans info for TVL
  const poolLoansInfos = (
    await sdk.api.abi.multiCall({
      calls: pools.map((pool) => ({
        target: poolInfoUtils,
        params: [pool],
      })),
      abi: poolInfoUtilsAbi.find((m) => m.name === 'poolLoansInfo'),
      chain,
    })
  ).output.map((o) => o.output);

  // Get token symbols (with permitFailure for non-standard tokens like MKR)
  const quoteSymbolsResult = await sdk.api.abi.multiCall({
    calls: quoteTokens.map((token) => ({ target: token })),
    abi: 'erc20:symbol',
    chain,
    permitFailure: true,
  });
  const quoteSymbols = quoteSymbolsResult.output.map((o, i) => {
    if (o.output) return o.output;
    // Use known symbol if available
    return knownSymbols[quoteTokens[i]] || null;
  });

  const collateralSymbolsResult = await sdk.api.abi.multiCall({
    calls: collateralTokens.map((token) => ({ target: token })),
    abi: 'erc20:symbol',
    chain,
    permitFailure: true,
  });
  const collateralSymbols = collateralSymbolsResult.output.map((o, i) => {
    if (o.output) return o.output;
    // Use known symbol if available
    return knownSymbols[collateralTokens[i]] || null;
  });

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
