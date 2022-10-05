const sdk = require('@defillama/sdk');

const utils = require('../utils');
const SavingsVaultViews = require('./abis/SavingsVaultViews.abi.json');
const SavingsVault = require('./abis/SavingsVault.abi.json');

const project = 'phuture';
const usvViewAddress = '0xE574beBdDB460e3E0588F1001D24441102339429';
const usvAddress = '0x6bAD6A9BcFdA3fd60Da6834aCe5F93B8cFed9598';
const url = 'https://app.phuture.finance';

interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
}

const main = (chain) => async (): Promise<LlamaPool[]> => {
  const { output: asset } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.asset,
    target: usvAddress
  });

  const { output: totalAssets } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.totalAssets,
    target: usvAddress
  });

  const { output: apy } = await sdk.api.abi.call({
    chain,
    abi: SavingsVaultViews.getAPY,
    params: [usvAddress],
    target: usvViewAddress
  });

  return [
    {
      pool: `${usvAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: utils.formatSymbol('USV'),
      tvlUsd: +totalAssets / 1e6,
      apyBase: apy / 10e6,
      rewardTokens: [asset],
      underlyingTokens: [asset],
      url: url + '/index/' + usvAddress
    }
  ];
};
module.exports = {
  timetravel: true,
  apy: main('ethereum'),
  url
};
