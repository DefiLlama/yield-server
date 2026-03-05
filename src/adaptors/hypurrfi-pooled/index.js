const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const poolAbi = require('./poolAbi');

// HypurrFi Pooled Lending (Aave V3 fork) on Hyperliquid L1
const POOL = '0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b';
const chain = 'hyperliquid';

const apy = async () => {
  // 1. Get reserves list from Pool contract
  const reservesList = (
    await sdk.api.abi.call({
      target: POOL,
      abi: poolAbi.find((m) => m.name === 'getReservesList'),
      chain,
    })
  ).output;

  // 2. Get reserve data for each asset
  const reserveDataResults = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((asset) => ({
        target: POOL,
        params: [asset],
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  // 3. Get token metadata
  const symbols = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({ target: t })),
      abi: 'erc20:symbol',
      chain,
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({ target: t })),
      abi: 'erc20:decimals',
      chain,
    })
  ).output.map((o) => o.output);

  // 4. Get aToken addresses and their total supply + underlying balances
  const aTokenAddresses = reserveDataResults.map((r) => r.aTokenAddress);

  const aTokenSupply = (
    await sdk.api.abi.multiCall({
      calls: aTokenAddresses.map((t) => ({ target: t })),
      abi: 'erc20:totalSupply',
      chain,
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      calls: aTokenAddresses.map((t, i) => ({
        target: reservesList[i],
        params: [t],
      })),
      abi: 'erc20:balanceOf',
      chain,
    })
  ).output.map((o) => o.output);

  // 5. Prices
  const priceKeys = reservesList
    .map((t) => `${chain}:${t}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // 6. Build pool objects
  const pools = reservesList
    .map((asset, i) => {
      const price = prices[`${chain}:${asset}`]?.price;
      if (!price) return null;

      const dec = Number(decimals[i]);
      const supply = aTokenSupply[i] / 10 ** dec;
      const totalSupplyUsd = supply * price;
      const available = underlyingBalances[i] / 10 ** dec;
      const tvlUsd = available * price;
      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      // Aave V3: liquidityRate is in ray (1e27), already annualized
      // Divide by 1e25 to get percentage (e.g. 5e25 → 5.0%)
      const apyBase = reserveDataResults[i].currentLiquidityRate / 1e25;
      const apyBaseBorrow =
        Number(reserveDataResults[i].currentVariableBorrowRate) / 1e25;

      return {
        pool: `${asset}-hypurrfi-pooled`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'hypurrfi-pooled',
        symbol: utils.formatSymbol(symbols[i]),
        tvlUsd,
        apyBase,
        apyBaseBorrow,
        totalSupplyUsd,
        totalBorrowUsd,
        underlyingTokens: [asset],
        poolMeta: 'Pooled',
        url: 'https://app.hypurr.fi/lend',
      };
    })
    .filter((p) => p && p.tvlUsd >= 10000)
    .filter((p) => utils.keepFinite(p));

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hypurr.fi/lend',
};
