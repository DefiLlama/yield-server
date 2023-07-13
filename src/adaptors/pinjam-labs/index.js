const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const abiLendingPool = require('./abiLendingPool');

const chains = {
  kava: {
    LendingPool: '0x11C3D91259b1c2Bd804344355C6A255001F7Ba1e',
    url: 'kava',
    reservesList: [
      {
        underlying: '0xc86c7c0efbd6a49b35e8714c5f59d99de09a225b',
        pToken: '0xb096768a0E4f5d08927C19Df9651293485b21072',
        vdToken: '0x13aB1A2e26f0F1022F2286960055847100Bd7218',
        symbol: 'kava',
        decimals: 18,
      },
      {
        underlying: '0xb44a9b6905af7c801311e8f4e76932ee959c663c',
        pToken: '0x16831114Dc5e44696f7aFf58C11865F1880E9E2a',
        vdToken: '0x67EaA3aEc47aAaBc8e5F4904ba15bf2409940244',
        symbol: 'multiUsdt',
        decimals: 6,
      },
      {
        underlying: '0xfa9343c3897324496a05fc75abed6bac29f8a40f',
        pToken: '0x0a7B71B0613FA58A742CddFC72963ACb9412760c',
        vdToken: '0x840c1911Bc9919DACd86Cffaf3f1436BAE314cD0',
        symbol: 'multiUsdc',
        decimals: 6,
      },
      {
        underlying: '0x765277eebeca2e31912c9946eae1021199b39c61',
        pToken: '0x2C0cA21e35B6f1C1A33fBD99D21Da1C63ad09e69',
        vdToken: '0xAd58d7E4B70B9cF068246bD1a7Bd2b88f25B8FEf',
        symbol: 'multiDai',
        decimals: 18,
      },
      {
        underlying: '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d',
        pToken: '0x82Ef01018980740a2C6c0f7cBcf840c42a629dBd',
        vdToken: '0x9421fFcFD3Edb1b3ca8Ef7B1104016bc529BB840',
        symbol: 'multiEth',
        decimals: 18,
      },
      {
        underlying: '0xeb466342c4d449bc9f53a865d5cb90586f405215',
        pToken: '0x5C91F5d2b7046A138c7D1775BfFEa68d5e95D68d',
        vdToken: '0xbB9D890D6511598ccC717D2C6C1266007dAa1D78',
        symbol: 'axlUsdc',
        decimals: 6,
      },
      {
        underlying: '0x5c7e299cf531eb66f2a1df637d37abb78e6200c7',
        pToken: '0x08CcC9665c40004d764E7Ed8F3c345FdE5Ff24d0',
        vdToken: '0x65bE004724622CD5FD54FDa4D6d71aaD9DfF9d7b',
        symbol: 'axlDai',
        decimals: 18,
      },
      {
        underlying: '0x919c1c267bc06a7039e03fcc2ef738525769109c',
        pToken: '0xc662B16F391ade279956283F14835164f1d367fE',
        vdToken: '0xB36239deC6cc681C0c7a49241fA6d20c7c263229',
        symbol: 'usdt',
        decimals: 6,
      },
    ],
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain === 'avalanche' ? 'avax' : chain;

      const [liquidityRes] = await Promise.all(
        ['erc20:totalSupply'].map((method) =>
          sdk.api.abi.multiCall({
            abi: method,
            calls: addresses.reservesList.map((t, i) => ({
              target: t.pToken,
              params: null,
            })),
            chain: sdkChain,
          })
        )
      );

      const liquidity = liquidityRes.output.map((o) => o.output);

      const pricesArray = addresses.reservesList.map(
        (t) => `${sdkChain}:${t.underlying}`
      );
      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      const totalBorrow = (
        await sdk.api.abi.multiCall({
          abi: 'erc20:totalSupply',
          calls: addresses.reservesList.map((p) => ({
            target: p.vdToken,
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const supplyRate = (
        await sdk.api.abi.multiCall({
          abi: abiLendingPool.find((m) => m.name === 'getSupplyRate'),
          calls: addresses.reservesList.map((p) => ({
            target: addresses.LendingPool,
            params: [p.underlying],
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const borrowRate = (
        await sdk.api.abi.multiCall({
          abi: abiLendingPool.find((m) => m.name === 'getBorrowRate'),
          calls: addresses.reservesList.map((p) => ({
            target: addresses.LendingPool,
            params: [p.underlying],
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      //   const reserveConfigurationData = (
      //     await sdk.api.abi.multiCall({
      //       calls: addresses.reservesList.map((t) => ({
      //         target: addresses.LendingPool,
      //         params: t.underlying,
      //       })),
      //       chain: sdkChain,
      //       abi: abiProtocolDataProvider.find(
      //         (n) => n.name === 'getReserveConfigurationData'
      //       ),
      //     })
      //   ).output.map((o) => o.output);

      return addresses.reservesList.map((t, i) => {
        const price = prices[`${sdkChain}:${t.underlying}`]?.price;
        const apyBase = supplyRate[i] / 1e25;
        const apyBaseBorrow = borrowRate[i] / 1e25;
        return {
          apyBase,
          apyBaseBorrow,
          project: 'pinjam-labs',
        };
      });
    })
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  //   timetravel: true,
  apy: getApy,
  //   url: 'https://app.pinjamlabs.com',
};
