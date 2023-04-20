const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const SECONDS_PER_YEAR = 31536000;

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const pool = async (chain, provider, marketName) => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: provider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: provider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: provider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: provider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupplyEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalancesEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimalsEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');

  const pricesEthereum = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  return reserveTokens.map((pool, i) => {
    const p = poolsReserveData[i];
    const price = pricesEthereum[`${chain}:${pool.tokenAddress}`]?.price;

    const supply = totalSupplyEthereum[i];
    const totalSupplyUsd =
      (supply / 10 ** underlyingDecimalsEthereum[i]) * price;

    const currentSupply = underlyingBalancesEthereum[i];
    const tvlUsd =
      (currentSupply / 10 ** underlyingDecimalsEthereum[i]) * price;

    return {
      pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
      chain,
      project: 'mahalend',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd: totalSupplyUsd - tvlUsd,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      ltv: poolsReservesConfigurationData[i].ltv / 10000,
      url: `https://app.mahalend.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=${marketName}`,
      borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
    };
  });
};

const apy = async () => {
  const ethPools = await pool(
    'ethereum',
    '0xCB5a1D4a394C4BA58999FbD7629d64465DdA70BC',
    'proto_mainnet_v3'
  );

  const arbPools = await pool(
    'arbitrum',
    '0xE76C1D2a7a56348574810e83D38c07D47f0641F3',
    'proto_arbitrum_v3'
  );

  const pools = [...ethPools, ...arbPools];

  const poolsToSkip = [
    '0x23799bb4e743bde3783c34f9519098abd38ab9bc-ethereum', // ignore weth; not used
    '0x1d6f76076e819f18d7f5a555631a4bcf1ea34511-arbitrum', // ignore sslp; not used
  ];

  return pools.filter((p) => !poolsToSkip.includes(p.pool));
};

module.exports = {
  timetravel: false,
  apy: apy,
};
