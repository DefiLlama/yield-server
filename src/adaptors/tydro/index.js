const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('../aave-v3/poolAbi');

const chain = 'ink';
const PROTOCOL_DATA_PROVIDER = '0x96086C25d13943C80Ff9a19791a40Df6aFC08328';

const getApy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      let totalBorrowUsd = totalSupplyUsd - tvlUsd;
      totalBorrowUsd = totalBorrowUsd < 0 ? 0 : totalBorrowUsd;

      return {
        pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'tydro',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url: `https://app.tydro.com/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_ink_v3`,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter((i) => Boolean(i));
};

const apy = async () => {
  const pools = await getApy();
  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.tydro.com/',
};
