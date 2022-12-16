const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

const getVaultMarketValue = {
  inputs: [],
  name: 'getVaultMarketValue',
  outputs: [
    {
      internalType: 'int256',
      name: 'vaultMarketValue',
      type: 'int256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const addresses = {
  tricryptoVault: '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068',
  dnGmxJuniorVault: '0x8478AB5064EbAC770DdCE77E7D31D969205F041E',
  dnGmxSeniorVault: '0xf9305009FbA7E381b3337b5fA157936d73c2CF36',
};

const poolsFunction = async () => {
  const tvls = Object.fromEntries(
    await Promise.all(
      Object.entries(addresses).map(async ([name, address]) => {
        let res = (
          await sdk.api.abi.call({
            abi: getVaultMarketValue,
            target: address,
            chain: 'arbitrum',
          })
        ).output;
        return [name, Number(ethers.utils.formatUnits(res, 6))];
      })
    )
  );

  const tricryptoVaultApyData = await utils.getData(
    'https://apis.rage.trade/data/v2/get-tricrypto-vault-apy?networkName=arbmain'
  );

  const dnVaultsApyData = await utils.getData(
    'https://apis.rage.trade/data/v2/get-dn-gmx-apy-breakdown?networkName=arbmain'
  );

  const apys = {
    tricryptoVault:
      (tricryptoVaultApyData.result.crvEmissions +
        tricryptoVaultApyData.result.tricryptoLpFees +
        tricryptoVaultApyData.result.rageLpFees) *
      100,
    dnGmxJuniorVault:
      dnVaultsApyData.result.juniorVault.glpTraderPnl +
      dnVaultsApyData.result.juniorVault.glpRewardsPct +
      dnVaultsApyData.result.juniorVault.esGmxRewards +
      dnVaultsApyData.result.juniorVault.btcBorrowApy +
      dnVaultsApyData.result.juniorVault.ethBorrowApy,
    dnGmxSeniorVault:
      dnVaultsApyData.result.seniorVault.aaveSupplyApy +
      dnVaultsApyData.result.seniorVault.glpRewardsPct,
  };

  const tricryptoVault = {
    pool: '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: utils.formatSymbol('80-20-Tricrypto'),
    tvlUsd: tvls.tricryptoVault,
    apy: apys.tricryptoVault,
  };

  const dnGmxJuniorVault = {
    pool: '0x8478AB5064EbAC770DdCE77E7D31D969205F041E',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: utils.formatSymbol('DN_GMX_JUNIOR'),
    tvlUsd: tvls.dnGmxJuniorVault,
    apy: apys.dnGmxJuniorVault,
  };

  const dnGmxSeniorVault = {
    pool: '0xf9305009FbA7E381b3337b5fA157936d73c2CF36',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: utils.formatSymbol('DN_GMX_SENIOR'),
    tvlUsd: tvls.dnGmxSeniorVault,
    apy: apys.dnGmxSeniorVault,
  };

  return [tricryptoVault, dnGmxJuniorVault, dnGmxSeniorVault];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.rage.trade/vaults',
};
