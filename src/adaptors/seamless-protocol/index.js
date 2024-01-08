const axios = require('axios');
const sdk = require('@defillama/sdk4');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');
const incentivesControllerAbi = require('./incentiveControllerAbi.json');

const incentivesController = '0x91Ac2FfF8CBeF5859eAA6DdA661feBd533cD3780';

const chain = 'base';
const SEAM = '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85';

const apy = async () => {
  const poolDataProvider = '0x2A0979257105834789bC6b9E1B00446DFbA8dFBa';
  const reserveTokens = (
    await sdk.api.abi.call({
      target: poolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const reserveTokensAddresses = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: poolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveTokensAddresses'),
      chain,
    })
  ).output.map((o) => o.output);

  const aTokens = (
    await sdk.api.abi.call({
      target: poolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: poolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: poolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const rewardsDataSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: incentivesControllerAbi.find(
        ({ name }) => name === 'getRewardsData'
      ),
      calls: aTokens.map((t) => ({
        target: incentivesController,
        params: [t.tokenAddress, SEAM],
      })),
    })
  ).output.map((o) => o.output);

  const rewardsDataBorrow = (
    await sdk.api.abi.multiCall({
      chain,
      abi: incentivesControllerAbi.find(
        ({ name }) => name === 'getRewardsData'
      ),
      calls: reserveTokensAddresses.map((t) => ({
        target: incentivesController,
        params: [t.variableDebtTokenAddress, SEAM],
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .concat(`${chain}:${SEAM}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens
    .map((pool, i) => {
      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      const totalBorrowUsd = totalSupplyUsd - tvlUsd;
      const rewardsPerYearUsdSupply =
        (rewardsDataSupply[i][1] / 1e18) *
        86400 *
        365 *
        prices[`${chain}:${SEAM}`].price;

      const rewardsPerYearUsdBorrow =
        (rewardsDataBorrow[i][1] / 1e18) *
        86400 *
        365 *
        prices[`${chain}:${SEAM}`].price;

      const apyReward = (rewardsPerYearUsdSupply / totalSupplyUsd) * 100;
      const apyRewardBorrow = (rewardsPerYearUsdBorrow / totalBorrowUsd) * 100;

      return {
        pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
        chain,
        project: 'seamless-protocol',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        apyReward,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        apyRewardBorrow,
        rewardTokens: [SEAM],
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
        url: `https://app.seamlessprotocol.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_base_v3`,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sparkprotocol.io/markets/',
};
