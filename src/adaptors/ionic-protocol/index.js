const axios = require('axios');
const sdk = require('@defillama/sdk');

const abiCore = require('./abiCore.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const utils = require('../utils');

const markets = [
  {
    ionWETH: '0x71ef7EDa2Be775E5A7aa8afD02C45F059833e9d2',
  },
  { ionUSDC: '0x2BE717340023C9e14C1Bb12cb3ecBcfd3c3fB038' },
  { ionUSDT: '0x94812F2eEa03A49869f95e1b5868C6f3206ee3D3' },
  { ionWBTC: '0xd70254C3baD29504789714A7c69d60Ec1127375C' },
  { ionweETH: '0x9a9072302B775FfBd3Db79a7766E75Cf82bcaC0A' },
  { ionezETH: '0x59e710215d45F584f44c0FEe83DA6d43D762D857' },
  { ionSTONE: '0x959FA710CCBb22c7Ce1e59Da82A247e686629310' },
];

const CHAINS = {
  mode: {
    CORE: '0xFB3323E24743Caf4ADD0fDCCFB268565c0685556',
  },
};

const apy = async (chain) => {
  const CORE = CHAINS[chain].CORE;

  const allMarkets = markets.map((i) => Object.values(i)).flat();

  const collateralFactorMantissa = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiCore.find((n) => n.name === 'markets'),
      calls: allMarkets.map((m) => ({
        target: CORE,
        params: [m],
      })),
    })
  ).output
    .map((o) => o.output)
    .map((i) => i.collateralFactorMantissa);

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
      abi: abiLToken.find((n) => n.name === 'totalBorrows'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const totalReserve = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'totalReserves'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const rateModel = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'interestRateModel'),
      calls: allMarkets.map((m) => ({
        target: m,
      })),
    })
  ).output.map((o) => o.output);

  const reserveFactor = (
    await sdk.api.abi.multiCall({
      chain,
      abi: abiLToken.find((n) => n.name === 'reserveFactorMantissa'),
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

  return allMarkets.map((p, i) => {
    const price = prices[`${chain}:${underlying[i]}`]?.price;
    const decimal = decimals[i] ?? 18;

    const totalBorrowUsd = (totalBorrow[i] / 10 ** decimal) * price;
    const tvlUsd = (cash[i] / 10 ** decimal) * price;
    const totalSupplyUsd = totalBorrowUsd + tvlUsd;

    const apyBase = ((supplyRate[i] / 1e18) * 86400 * 365 * 100) / 2;
    const apyBaseBorrow = ((borrowRate[i] / 1e18) * 86400 * 365 * 100) / 2;
    const underlyingTokens = [underlying[i]];
    const ltv = collateralFactorMantissa[i] / 1e18;

    return {
      pool: p,
      chain,
      project: 'ionic-protocol',
      symbol: symbol[i] ?? 'ETH',
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      underlyingTokens,
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
  url: 'https://app.ionic.money/',
};
