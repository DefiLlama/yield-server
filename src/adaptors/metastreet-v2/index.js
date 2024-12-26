const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const abi = require('./abi.json');

const METASTREET_POOL_FACTORY = {
  ethereum: '0x1c91c822F6C5e117A2abe2B33B0E64b850e67095',
  base: '0x41cF7ea4Ba650191e829A6bD31B9e2049C78D858',
  blast: '0x5F42c24Af1227c3c669035a6cB549579ed0F99dF',
};
const MAX_UINT_128 = '0xffffffffffffffffffffffffffffffff';

const API = sdk.api.abi;

const getApy = async (chain) => {
  const pools = (
    await API.call({
      target: METASTREET_POOL_FACTORY[chain],
      abi: abi.getPools,
      chain,
    })
  ).output;

  const collateralTokens = (
    await API.multiCall({
      calls: pools.map((pool) => ({
        target: pool,
        params: [],
      })),
      abi: abi.collateralToken,
      chain,
    })
  ).output.map((o) => o.output);
  const collateralTokenNames = (
    await API.multiCall({
      abi: abi.name,
      calls: collateralTokens.map((token) => ({ target: token, params: [] })),
      chain,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = (
    await API.multiCall({
      abi: abi.currencyToken,
      calls: pools.map((pool) => {
        return {
          target: pool,
          params: [],
        };
      }),
      chain,
    })
  ).output.map((o) => o.output);
  const tokenDecimals = (
    await API.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((token) => ({ target: token, params: [] })),
      chain,
    })
  ).output.map((o) => o.output);
  const tokenSymbols = (
    await API.multiCall({
      abi: 'erc20:symbol',
      calls: tokens.map((token) => ({ target: token, params: [] })),
      chain,
    })
  ).output.map((o) => o.output);

  const decimalsMap = {};
  tokens.forEach((token, index) => {
    decimalsMap[token] = tokenDecimals[index];
  });

  const pricesArray = tokens.map((t) => `${chain}:${t}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  const poolLiquidityNodes = (
    await API.multiCall({
      abi: abi.liquidityNodes,
      calls: pools.map((pool) => ({
        target: pool,
        params: [0, MAX_UINT_128],
      })),
      chain,
    })
  ).output.map((o) => o.output);

  return await Promise.all(
    poolLiquidityNodes.map(async (liquidityNodes, poolIndex) => {
      const pool = pools[poolIndex];
      const collateralToken = collateralTokens[poolIndex];
      const collateralTokenName = collateralTokenNames[poolIndex];
      const token = tokens[poolIndex];
      const tokenSymbol = tokenSymbols[poolIndex];
      const price = prices[`${chain}:${token}`]?.price;
      const decimals = decimalsMap[token];
      const scalingFactor = 10 ** (18 - decimals);
      const totalValue = liquidityNodes.reduce((partialSum, node) => {
        return partialSum + +node.value;
      }, 0);

      const apy = await (
        await API.multiCall({
          abi: abi.liquidityNodeWithAccrual,
          calls: liquidityNodes.map((node) => {
            return {
              target: pool,
              params: [node.tick],
            };
          }),
          chain,
          permitFailure: true,
        })
      ).output
        .filter((o) => o.success)
        .reduce((bestApy, o) => {
          const accrualRate = o.output[1].rate;
          const tickValue = o.output[0].value;
          const apy = (+accrualRate / +tickValue) * 86400 * 365 * 100;
          return bestApy > apy ? bestApy : apy;
        }, 0);

      return {
        pool: pool,
        poolMeta: collateralTokenName,
        chain,
        project: 'metastreet-v2',
        symbol: tokenSymbol,
        tvlUsd: (totalValue / scalingFactor / 10 ** decimals) * price,
        apy,
      };
    })
  );
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(METASTREET_POOL_FACTORY).map(async (chain) => getApy(chain))
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.metastreet.xyz/earn',
};
