const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');

const utils = require('../utils');

const chains = {
  ethereum: {
    LendingPool: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
    ProtocolDataProvider: '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d',
    url: 'mainnet',
  },
  polygon: {
    LendingPool: '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
    ProtocolDataProvider: '0x7551b5D2763519d4e37e8B81929D336De671d46d',
    url: 'polygon',
  },
  avalanche: {
    LendingPool: '0x4F01AeD16D97E3aB5ab2B501154DC9bb0F1A5A2C',
    ProtocolDataProvider: '0x65285E9dfab318f57051ab2b139ccCf232945451',
    url: 'avalanche',
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain === 'avalanche' ? 'avax' : chain;

      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain: sdkChain,
        })
      ).output;

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
            permitFailure: true,
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
        if (!config.isActive) return null;

        const price = prices[`${sdkChain}:${t}`]?.price;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;

        const url = `https://app.aave.com/reserve-overview/?underlyingAsset=${t.toLowerCase()}&marketName=proto_${
          chains[chain].url
        }`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'aave-v2',
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
