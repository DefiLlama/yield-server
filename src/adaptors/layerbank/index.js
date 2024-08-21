const axios = require('axios');
const sdk = require('@defillama/sdk');

const abiCore = require('./abiCore.json');
const abiLABDistributor = require('./abiLABDistributor.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const abiPriceCalculator = require('./abiPriceCalculator.json');
const utils = require('../utils');

const CHAINS = {
  manta: {
    CORE: '0xB7A23Fc0b066051dE58B922dC1a08f33DF748bbf',
    LABDistributor: '0x67c10B7b8eEFe92EB4DfdEeedd94263632E483b0',
    LAB: '0x20a512dbdc0d006f46e6ca11329034eb3d18c997',
    PriceCalculator: '0x38f4384B457F81A4895c93a7503c255eFd0746d2',
  },
  linea: {
    CORE: '0x009a0b7C38B542208936F1179151CD08E2943833',
    LABDistributor: '0x5D06067f86946620C326713b846DdC8B97470957',
    LAB: '0xB97F21D1f2508fF5c73E7B5AF02847640B1ff75d',
    PriceCalculator: '0x4F5F443fEC450fD64Dce57CCacE8f5ad10b4028f',
  },
  scroll: {
    CORE: '0xEC53c830f4444a8A56455c6836b5D2aA794289Aa',
    LABDistributor: '0xF1F897601A525F57c5EA751a1F3ec5f9ADAc0321',
    LAB: '0x2A00647F45047f05BDed961Eb8ECABc42780e604',
    PriceCalculator: '0x760bd7Fc100F217678D1b521404D2E93Db7Bec5F',
  },
};

const apy = async (chain) => {
  const CORE = CHAINS[chain].CORE;
  const LABDistributor = CHAINS[chain].LABDistributor;
  const LAB = CHAINS[chain].LAB;
  const PriceCalculator = CHAINS[chain].PriceCalculator;

  const allMarkets = (
    await sdk.api.abi.call({
      target: CORE,
      chain,
      abi: abiCore.find(({ name }) => name === 'allMarkets'),
    })
  ).output;

  const marketInfoOf = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiCore.find((n) => n.name === 'marketInfoOf'),
      calls: allMarkets.map((m) => ({
        target: CORE,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'totalSupply'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const totalBorrow = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'totalBorrow'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const totalReserve = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'totalReserve'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const rateModel = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'rateModel'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const reserveFactor = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'reserveFactor'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const cash = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'getCash'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const borrowRate = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiRateModelSlope.find((n) => n.name === 'getBorrowRate'),
      calls: rateModel.map((m, i) => ({
        target: m,
        params: [cash[i], totalBorrow[i], totalReserve[i]],
      })),
    })
  ).output.map((o) => o.output);

  const supplyRate = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiRateModelSlope.find((n) => n.name === 'getSupplyRate'),
      calls: rateModel.map((m, i) => ({
        target: m,
        params: [cash[i], totalBorrow[i], totalReserve[i], reserveFactor[i]],
      })),
    })
  ).output.map((o) => o.output);

  const distributions = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLABDistributor.find((n) => n.name === 'distributions'),
      calls: allMarkets.map((m) => ({
        target: LABDistributor,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const underlying = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'underlying'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const symbol = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:symbol',
      calls: underlying.map((m) => ({
        target: m,
      })),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: underlying.map((m) => ({
        target: m,
      })),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const priceKeys = underlying.map((t) => `${chain}:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const priceLAB =
    chain !== 'manta'
      ? (
          await sdk.api.abi.call({
            target: PriceCalculator,
            abi: abiPriceCalculator.find((m) => m.name === 'priceOf'),
            params: [LAB],
            chain,
          })
        ).output
      : null;

  return allMarkets.map((p, i) => {
    const price = prices[`${chain}:${underlying[i]}`]?.price;
    const decimal = decimals[i] ?? 18;

    const totalSupplyUsd = (totalSupply[i] / 10 ** decimal) * price;
    const totalBorrowUsd = (totalBorrow[i] / 10 ** decimal) * price;
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    const apyBase = (supplyRate[i] / 1e18) * 86400 * 365 * 100;
    const apyBaseBorrow = (borrowRate[i] / 1e18) * 86400 * 365 * 100;
    const underlyingTokens = [underlying[i]];
    const ltv = marketInfoOf[i].collateralFactor / 1e18;

    const apyReward =
      (((distributions[i].supplySpeed / 1e18) *
        86400 *
        365 *
        (priceLAB / 1e18)) /
        totalSupplyUsd) *
      100;

    const apyRewardBorrow =
      (((distributions[i].borrowSpeed / 1e18) *
        86400 *
        365 *
        (priceLAB / 1e18)) /
        totalBorrowUsd) *
      100;

    return {
      pool: p,
      chain,
      project: 'layerbank',
      symbol: symbol[i] ?? 'ETH',
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      apyReward,
      apyRewardBorrow,
      underlyingTokens,
      rewardTokens: apyReward > 0 ? [LAB] : [],
      ltv,
    };
  });
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(CHAINS).map((chain) => apy(chain))
  );
  return pools.flat().filter((i) => utils.keepFinite(i));
};

module.exports = {
  apy: main,
  url: 'https://manta.layerbank.finance/bank',
};
