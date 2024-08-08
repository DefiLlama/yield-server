const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const abi = require('./abi.json');

const ADDRESSES = {
  LendingPool: '0x90384334333f3356eFDD5b20016350843b90f182',
  ProtocolDataProvider: '0x5BF9B2644E273D92ff1C31A83476314c95953133',
};

const getApy = async () => {
  const chain = 'astar';

  const reservesList = (
    await sdk.api.abi.call({
      target: ADDRESSES.LendingPool,
      abi: abi['Lendingpool.getReservesList'],
      chain: chain,
    })
  ).output;

  const reserveData = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((i) => ({
        target: ADDRESSES.LendingPool,
        params: [i],
      })),
      abi: abi['Lendingpool.getReserveData'],
      chain: chain,
    })
  ).output.map((o) => o.output);

  const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
    ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: reservesList.map((t, i) => ({
          target: t,
          params:
            method === 'erc20:balanceOf' ? reserveData[i].lTokenAddress : null,
        })),
        chain: chain,
      })
    )
  );

  const liquidity = liquidityRes.output.map((o) => o.output);
  const decimals = decimalsRes.output.map((o) => o.output);
  const symbols = symbolsRes.output.map((o) => o.output);

  const totalBorrow = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:totalSupply',
      calls: reserveData.map((p) => ({
        target: p.variableDebtTokenAddress,
      })),
      chain: chain,
    })
  ).output.map((o) => o.output);

  const reserveConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({
        target: ADDRESSES.ProtocolDataProvider,
        params: t,
      })),
      chain: chain,
      abi: abi['ProtocolProvider.getReserveConfigurationData'],
    })
  ).output.map((o) => o.output);

  const pricesArray = reservesList.map((t) => `${chain}:${t}`);
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).data.coins;

  return reservesList
    .map((t, i) => {
      const config = reserveConfigurationData[i];
      if (!config.isActive) return null;

      const price = prices[`${chain}:${t}`]?.price;

      const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
      const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
      const totalSupplyUsd = tvlUsd + totalBorrowUsd;

      const apyBase = Number(reserveData[i].currentLiquidityRate) / 1e25;
      const apyBaseBorrow =
        Number(reserveData[i].currentVariableBorrowRate) / 1e25;

      const ltv = Number(config.ltv) / 1e4;
      const borrowable = config.borrowingEnabled;
      const frozen = config.isFrozen;

      return {
        pool: `${reserveData[i].lTokenAddress}-${chain}`.toLowerCase(),
        symbol: symbols[i],
        project: 'starlay-finance',
        chain,
        tvlUsd,
        apyBase,
        underlyingTokens: [t],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        ltv,
        borrowable,
        poolMeta: frozen ? 'frozen' : null,
      };
    })
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
  url: 'https://starlay.finance/app/markets',
};
