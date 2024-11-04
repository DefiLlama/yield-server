const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abi.js');
const abiToken = require('./abiToken.js');
const utils = require('../utils.js');

const gammatrollerAddress = '0x1e0c9d09f9995b95ec4175aaa18b49f49f6165a3';
const GAMMA = '0xb3cb6d2f8f2fde203a022201c81a96c167607f15';

const blocksPerDay = 28800;
const daysPerYear = 365;

const apy = async () => {
  const markets = (
    await sdk.api.abi.call({
      target: gammatrollerAddress,
      abi: abi.find((m) => m.name === 'getAllMarkets'),
      chain: 'bsc',
    })
  ).output;

  const metadata = (
    await sdk.api.abi.multiCall({
      abi: abi.find((i) => i.name === 'markets'),
      calls: markets.map((m) => ({
        target: gammatrollerAddress,
        params: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const gammaSpeeds = (
    await sdk.api.abi.multiCall({
      abi: abi.find((i) => i.name === 'gammaSpeeds'),
      calls: markets.map((m) => ({
        target: gammatrollerAddress,
        params: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'totalSupply'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const totalBorrows = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'totalBorrows'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const exchangeRateStored = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'exchangeRateStored'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const supplyRatePerBlock = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'supplyRatePerBlock'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const borrowRatePerBlock = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'borrowRatePerBlock'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const underlying = (
    await sdk.api.abi.multiCall({
      abi: abiToken.find((i) => i.name === 'underlying'),
      calls: markets.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const symbol = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: underlying.map((m) => ({
        target: m,
      })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const priceKeys = [...underlying, GAMMA].map((t) => `bsc:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;
  const gammaPriceUSD = prices[`bsc:${GAMMA}`].price;

  const pools = markets.map((m, i) => {
    const price = prices[`bsc:${underlying[i]}`]?.price;

    const totalSupplyUsd =
      (((totalSupply[i] / 1e18) * exchangeRateStored[i]) / 1e18) * price;

    const totalBorrowUsd = (totalBorrows[i] / 1e18) * price;

    const apyBase =
      (Math.pow(
        (supplyRatePerBlock[i] / 1e18) * blocksPerDay + 1,
        daysPerYear
      ) -
        1) *
      100;

    const apyBaseBorrow =
      (Math.pow(
        (borrowRatePerBlock[i] / 1e18) * blocksPerDay + 1,
        daysPerYear
      ) -
        1) *
      100;

    const gammaPerDay = (gammaSpeeds[i] / 1e18) * blocksPerDay;

    const apyReward =
      100 *
      (Math.pow(
        1 + (gammaPriceUSD * gammaPerDay) / totalSupplyUsd,
        daysPerYear
      ) -
        1);

    const apyRewardBorrow =
      100 *
      (Math.pow(
        1 + (gammaPriceUSD * gammaPerDay) / totalBorrowUsd,
        daysPerYear
      ) -
        1);

    return {
      pool: m.toLowerCase(),
      chain: 'BSC',
      project: 'green-planet',
      symbol: symbol[i],
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase,
      apyReward,
      rewardTokens:
        apyReward > 0 ? ['0xb3cb6d2f8f2fde203a022201c81a96c167607f15'] : [],
      underlyingTokens: [underlying[i]],
      // borrow fields
      apyBaseBorrow,
      apyRewardBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: metadata[i].collateralFactorMantissa / 1e18,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
  url: 'https://app.planet.finance/lending',
};
