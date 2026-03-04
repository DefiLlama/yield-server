const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const poolAbi = require('../aave-v3/poolAbi');

// RMM v3 PoolDataProvider on Gnosis
const POOL_DATA_PROVIDER = '0x11b45acc19656c6c52f93d8034912083ac7dd756';
const CHAIN = 'xdai';

async function apy() {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: POOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: CHAIN,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: POOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: CHAIN,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: POOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: POOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${CHAIN}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens
    .map((pool, i) => {
      const config = poolsReservesConfigurationData[i];
      if (config.isFrozen || !config.isActive) return null;

      const p = poolsReserveData[i];
      const decimals = Number(config.decimals);
      const price = prices[`${CHAIN}:${pool.tokenAddress}`]?.price;
      if (!price) return null;

      const totalSupplyUsd = (totalSupply[i] / 10 ** decimals) * price;
      const tvlUsd = (underlyingBalances[i] / 10 ** decimals) * price;
      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      return {
        pool: `${pool.tokenAddress}-realt`,
        chain: utils.formatChain(CHAIN),
        project: 'realt-tokens',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: utils.aprToApy((p.liquidityRate / 1e27) * 100),
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: utils.aprToApy((p.variableBorrowRate / 1e27) * 100),
        ltv: config.ltv / 10000,
        borrowable: config.borrowingEnabled,
        url: 'https://rmm.realtoken.network/markets/',
      };
    })
    .filter((i) => Boolean(i) && utils.keepFinite(i));
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://rmm.realtoken.network/markets/',
};
