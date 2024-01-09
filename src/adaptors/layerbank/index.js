const axios = require('axios');
const sdk = require('@defillama/sdk4');

const abiCore = require('./abiCore.json');
const abiLABDistributor = require('./abiLABDistributor.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const abiPriceCalculator = require('./abiPriceCalculator.json');

const CORE = '0xB7A23Fc0b066051dE58B922dC1a08f33DF748bbf';
const LABDistributor = '0x67c10B7b8eEFe92EB4DfdEeedd94263632E483b0';
const LAB = '0x20a512dbdc0d006f46e6ca11329034eb3d18c997';
const PriceCalculator = '0x38f4384B457F81A4895c93a7503c255eFd0746d2';
const CHAIN = 'manta';

const apy = async () => {
  const allMarkets = (
    await sdk.api.abi.call({
      target: CORE,
      chain: CHAIN,
      abi: abiCore.find(({ name }) => name === 'allMarkets'),
    })
  ).output;

  const marketInfoOf = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiCore.find((n) => n.name === 'marketInfoOf'),
      calls: allMarkets.map((m) => ({
        target: CORE,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'totalSupply'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const totalBorrow = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'totalBorrow'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const totalReserve = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'totalReserve'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const rateModel = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'rateModel'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const reserveFactor = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'reserveFactor'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const cash = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'getCash'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const borrowRate = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiRateModelSlope.find((n) => n.name === 'getBorrowRate'),
      calls: rateModel.map((m, i) => ({
        target: m,
        params: [cash[i], totalBorrow[i], totalReserve[i]],
      })),
    })
  ).output.map((o) => o.output);

  const supplyRate = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiRateModelSlope.find((n) => n.name === 'getSupplyRate'),
      calls: rateModel.map((m, i) => ({
        target: m,
        params: [cash[i], totalBorrow[i], totalReserve[i], reserveFactor[i]],
      })),
    })
  ).output.map((o) => o.output);

  const distributions = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLABDistributor.find((n) => n.name === 'distributions'),
      calls: allMarkets.map((m) => ({
        target: LABDistributor,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const underlying = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: abiLToken.find((n) => n.name === 'underlying'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const symbol = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:symbol',
      calls: underlying.map((m) => ({
        target: m,
      })),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: underlying.map((m) => ({
        target: m,
      })),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const priceKeys = underlying.map((t) => `${CHAIN}:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const priceLAB = (
    await sdk.api.abi.call({
      target: PriceCalculator,
      abi: abiPriceCalculator.find((m) => m.name === 'priceOf'),
      params: [LAB],
      chain: CHAIN,
    })
  ).output;

  return allMarkets.map((p, i) => {
    const price = prices[`${CHAIN}:${underlying[i]}`]?.price;
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
      chain: CHAIN,
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

module.exports = {
  apy,
  url: 'https://manta.layerbank.finance/bank',
};
