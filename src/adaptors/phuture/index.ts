const sdk = require('@defillama/sdk');

const utils = require('../utils');
const SavingsVaultViews = require('./abis/SavingsVaultViews.abi.json');
const SavingsVault = require('./abis/SavingsVault.abi.json');

const project = 'phuture';
const url = 'https://app.phuture.finance';

const usvAddress = '0x6bAD6A9BcFdA3fd60Da6834aCe5F93B8cFed9598';
const usvViewAddress = '0xE574beBdDB460e3E0588F1001D24441102339429';

const main = (chain) => async (): Promise<Array<object>> => {
  const { output: asset } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.asset,
    target: usvAddress,
  });

  const { output: totalAssets } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.totalAssets,
    target: usvAddress,
  });

  const { output: apy } = await sdk.api.abi.call({
    chain,
    abi: SavingsVaultViews.getAPY,
    params: [usvAddress],
    target: usvViewAddress,
  });

  return [
    {
      pool: `${usvAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: 'USDC',
      tvlUsd: +totalAssets / 1e6,
      apyBase: apy / 10e6,
      rewardTokens: [asset],
      underlyingTokens: [asset],
      url: url + '/index/' + usvAddress.toLowerCase(),
      poolMeta: 'USV',
    },
  ];
};

module.exports = {
  timetravel: true,
  apy: main('ethereum'),
  url,
};
