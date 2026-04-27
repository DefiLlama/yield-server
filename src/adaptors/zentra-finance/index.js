const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const CHAIN = 'citrea';
const POOL_DATA_PROVIDER = '0x0FC811fE6bD0Be53717f9ca722E30a7bc4B90C31';

const apy = async () => {
  const [reserveTokens, aTokens] = await Promise.all([
    sdk.api.abi.call({
      target: POOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: POOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: CHAIN,
    }),
  ]);

  const reserves = reserveTokens.output;
  const atokens = aTokens.output;

  const [reserveData, reserveConfig, totalSupply, underlyingBalances, decimals] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: reserves.map((p) => ({ target: POOL_DATA_PROVIDER, params: p.tokenAddress })),
        abi: poolAbi.find((m) => m.name === 'getReserveData'),
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: reserves.map((p) => ({ target: POOL_DATA_PROVIDER, params: p.tokenAddress })),
        abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: atokens.map((t) => ({ target: t.tokenAddress })),
        abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: atokens.map((t, i) => ({
          target: reserves[i].tokenAddress,
          params: [t.tokenAddress],
        })),
        abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: atokens.map((t) => ({ target: t.tokenAddress })),
        abi: aTokenAbi.find(({ name }) => name === 'decimals'),
        chain: CHAIN,
      }),
    ]);

  const priceKeys = reserves.map((t) => `${CHAIN}:${t.tokenAddress}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserves
    .map((reserve, i) => {
      const price = prices[`${CHAIN}:${reserve.tokenAddress}`]?.price;
      const dec = Number(decimals.output[i].output);
      const p = reserveData.output[i].output;
      const cfg = reserveConfig.output[i].output;

      const totalSupplyUsd =
        (totalSupply.output[i].output / 10 ** dec) * price;
      const tvlUsd =
        (underlyingBalances.output[i].output / 10 ** dec) * price;

      return {
        pool: `${atokens[i].tokenAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'zentra-finance',
        symbol: reserve.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 1e27) * 100,
        underlyingTokens: [reserve.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd: totalSupplyUsd - tvlUsd,
        apyBaseBorrow: (p.variableBorrowRate / 1e27) * 100,
        ltv: cfg.ltv / 10000,
        borrowable: cfg.borrowingEnabled,
        url: `https://zentra.finance/markets/${reserve.symbol.toLowerCase().replace(/\.e$/, '')}`, // remove .e suffix
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://zentra.finance/markets',
};
