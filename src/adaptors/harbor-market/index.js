const ethers = require('ethers');
const { JsonRpcProvider } = require('ethers');
const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');

const utils = require('../utils');

const chains = {
  bsc: {
    LendingPool: '0xf5Ab6C920af8f1bd4b16fDa9e7EF3173ffb616f7',
    ProtocolDataProvider: '0xFa0AC9b741F0868B2a8C4a6001811a5153019818',
    url: 'bsc',
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain;

      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain: sdkChain,
        })
      ).output.filter((address) => address.toLowerCase() !== '0x4206931337dc273a630d328dA6441786BfaD668f'.toLowerCase());;

      const reserveData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((i) => ({
            target: addresses.LendingPool,
            params: [i],
          })),
          abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
        ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
          sdk.api.abi.multiCall({
            abi: method,
            calls: reservesList.map((t, i) => ({
              target: t,
              params:
                method === 'erc20:balanceOf'
                  ? reserveData[i].aTokenAddress
                  : null,
            })),
            chain: sdkChain,
          })
        )
      );

      const liquidity = liquidityRes.output.map((o) => o.output);
      const decimals = decimalsRes.output.map((o) => o.output);
      let symbols = symbolsRes.output.map((o) => o.output);
      // maker symbol is null
      const mkrIdx = symbols.findIndex((s) => s === null);
      symbols[mkrIdx] = 'MKR';

      const totalBorrow = (
        await sdk.api.abi.multiCall({
          abi: 'erc20:totalSupply',
          calls: reserveData.map((p) => ({
            target: p.variableDebtTokenAddress,
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const reserveConfigurationData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((t) => ({
            target: addresses.ProtocolDataProvider,
            params: t,
          })),
          chain: sdkChain,
          abi: abiProtocolDataProvider.find(
            (n) => n.name === 'getReserveConfigurationData'
          ),
        })
      ).output.map((o) => o.output);

      const pricesArray = reservesList.map((t) => `${sdkChain}:${t}`);
      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      return reservesList.map((t, i) => {
        const config = reserveConfigurationData[i];
        if (!config || !config.isActive) return null;

        const price = prices[`${sdkChain}:${t}`]?.price;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;
        const poolSymbol = symbols[i].toLowerCase()
        const url = `https://harbor.market/markets/${poolSymbol}`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'harbor-market',
          chain,
          tvlUsd,
          apyBase,
          underlyingTokens: [t],
          url,
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow,
          ltv,
          borrowable,
          poolMeta: frozen ? 'frozen' : null,
        };
      });
    })
  );
  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};