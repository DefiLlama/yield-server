const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// STBT - Short-term Treasury Bill Token by MatrixDock
// Backed by US Treasury securities and reverse repos
// STBT is a rebasing token - yield is distributed by increasing token balances
// The price stays around $1, so we calculate APY from totalSupply/totalShares ratio growth
const tokens = {
  ethereum: [
    {
      address: '0x530824da86689c9c17cdc2871ff29b058345b44a',
      symbol: 'STBT',
      name: 'Short-term Treasury Bill Token',
    },
  ],
};

const totalSharesAbi = {
  inputs: [],
  name: 'totalShares',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const getBlockNumberDaysBefore = async (chain, days) => {
  const timestamp = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const response = await axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp}`
  );
  return response.data.height;
};

const getSharePrice = async (address, chain, block = 'latest') => {
  const [supplyResult, sharesResult] = await Promise.all([
    sdk.api.abi.call({
      target: address,
      abi: 'erc20:totalSupply',
      chain,
      block,
    }),
    sdk.api.abi.call({
      target: address,
      abi: totalSharesAbi,
      chain,
      block,
    }),
  ]);

  const totalSupply = BigInt(supplyResult.output);
  const totalShares = BigInt(sharesResult.output);

  if (totalShares === BigInt(0)) return 0;

  // Return as number with high precision (18 decimals)
  return Number(totalSupply * BigInt(1e18) / totalShares) / 1e18;
};

const calculateApy = (currentSharePrice, historicalSharePrice, days) => {
  if (historicalSharePrice > 0 && currentSharePrice > historicalSharePrice) {
    const growth = currentSharePrice / historicalSharePrice;
    const annualizationFactor = 365 / days;
    return (Math.pow(growth, annualizationFactor) - 1) * 100;
  }
  return 0;
};

const getPoolsForChain = async (chain) => {
  const chainTokens = tokens[chain];
  if (!chainTokens || chainTokens.length === 0) return [];

  // Get historical block numbers for 30d and 7d APY
  let block30d, block7d;
  try {
    [block30d, block7d] = await Promise.all([
      getBlockNumberDaysBefore(chain, 30),
      getBlockNumberDaysBefore(chain, 7),
    ]);
  } catch (e) {
    block30d = null;
    block7d = null;
  }

  const poolData = [];

  for (const token of chainTokens) {
    try {
      const [supplyResult, decimalsResult] = await Promise.all([
        sdk.api.abi.call({
          target: token.address,
          abi: 'erc20:totalSupply',
          chain,
        }),
        sdk.api.abi.call({
          target: token.address,
          abi: 'erc20:decimals',
          chain,
        }),
      ]);

      const supply = BigInt(supplyResult.output);
      const decimals = Number(decimalsResult.output);

      if (supply === BigInt(0)) continue;

      const priceKey = `${chain}:${token.address}`;
      const priceResponse = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKey}`
      );
      const currentPrice = priceResponse.data.coins[priceKey]?.price || 1;

      const scale = BigInt(10) ** BigInt(decimals);
      const supplyNum = Number(supply / scale);
      const tvlUsd = supplyNum * currentPrice;

      if (tvlUsd < 10000) continue;

      // Calculate APY from share price growth (rebasing mechanism)
      let apyBase = 0;
      let apyBase7d = 0;

      try {
        const sharePricePromises = [getSharePrice(token.address, chain)];
        if (block30d) sharePricePromises.push(getSharePrice(token.address, chain, block30d));
        if (block7d) sharePricePromises.push(getSharePrice(token.address, chain, block7d));

        const sharePrices = await Promise.all(sharePricePromises);
        const currentSharePrice = sharePrices[0];
        const sharePrice30d = block30d ? sharePrices[1] : null;
        const sharePrice7d = block7d ? sharePrices[block30d ? 2 : 1] : null;

        if (sharePrice30d) {
          apyBase = calculateApy(currentSharePrice, sharePrice30d, 30);
        }
        if (sharePrice7d) {
          apyBase7d = calculateApy(currentSharePrice, sharePrice7d, 7);
        }
      } catch (e) {
        // If historical query fails, APY stays 0
      }

      poolData.push({
        pool: `${token.address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'matrixdock-stbt',
        symbol: utils.formatSymbol(token.symbol),
        tvlUsd,
        apyBase: Number(apyBase.toFixed(2)),
        apyBase7d: Number(apyBase7d.toFixed(2)),
        underlyingTokens: [token.address],
        poolMeta: token.name,
      });
    } catch (e) {
      // Skip token if any error
      continue;
    }
  }

  return poolData;
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(tokens).map((chain) => getPoolsForChain(chain))
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.matrixdock.com/',
};
