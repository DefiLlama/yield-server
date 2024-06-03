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
    tricryptoVault: {
      base:
        (tricryptoVaultApyData.result.tricryptoLpFees +
          tricryptoVaultApyData.result.rageLpFees) *
        100,
      reward: tricryptoVaultApyData.result.crvEmissions * 100,
    },
    dnGmxJuniorVault: {
      base:
        dnVaultsApyData.result.juniorVault.glpTraderPnl +
        dnVaultsApyData.result.juniorVault.btcBorrowApy +
        dnVaultsApyData.result.juniorVault.ethBorrowApy,
      reward:
        dnVaultsApyData.result.juniorVault.glpRewardsPct +
        dnVaultsApyData.result.juniorVault.esGmxRewards,
    },
    dnGmxSeniorVault: {
      base: dnVaultsApyData.result.seniorVault.aaveSupplyApy,
      reward: dnVaultsApyData.result.seniorVault.glpRewardsPct,
    },
  };

  const tricryptoVault = {
    pool: '0x1d42783E7eeacae12EbC315D1D2D0E3C6230a068',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: utils.formatSymbol('80-20-Tricrypto'),
    tvlUsd: tvls.tricryptoVault,
    underlyingTokens: ['0x8e0B8c8BB9db49a46697F3a5Bb8A308e744821D2'], // tricrypto
    apy: apys.tricryptoVault.base + apys.tricryptoVault.reward,
  };

  const dnGmxJuniorVault = {
    pool: '0x8478AB5064EbAC770DdCE77E7D31D969205F041E',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: 'GLP',
    tvlUsd: tvls.dnGmxJuniorVault,
    poolMeta: 'DN_GMX_JUNIOR',
    underlyingTokens: ['0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE'], // sglp
    apy: apys.dnGmxJuniorVault.base + apys.dnGmxJuniorVault.reward,
  };

  const dnGmxSeniorVault = {
    pool: '0xf9305009FbA7E381b3337b5fA157936d73c2CF36',
    chain: utils.formatChain('arbitrum'),
    project: 'rage-trade',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvls.dnGmxSeniorVault,
    poolMeta: 'DN_GMX_SENIOR',
    underlyingTokens: ['0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'], // usdc
    apy: apys.dnGmxSeniorVault.base + apys.dnGmxSeniorVault.reward,
  };

  return [tricryptoVault, dnGmxJuniorVault, dnGmxSeniorVault];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.rage.trade/vaults',
};
