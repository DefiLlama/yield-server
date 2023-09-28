const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const SavingsVaultViews = require('./abis/SavingsVaultViews.abi.json');
const SavingsVault = require('./abis/SavingsVault.abi.js');

const project = 'phuture';
const url = 'https://app.phuture.finance';

const usvAddress = '0x6bAD6A9BcFdA3fd60Da6834aCe5F93B8cFed9598';
const usvViewAddress = '0xE574beBdDB460e3E0588F1001D24441102339429';

const main = (chain) => async (): Promise<Array<object>> => {
  const { output: asset } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.find((m) => m.name === 'asset'),
    target: usvAddress,
  });

  const { output: totalAssets } = await sdk.api.abi.call({
    chain,
    abi: SavingsVault.find((m) => m.name === 'totalSupply'),
    target: usvAddress,
  });

  const { output: apy } = await sdk.api.abi.call({
    chain,
    abi: SavingsVaultViews.getAPY,
    params: [usvAddress],
    target: usvViewAddress,
  });

  const usdcPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${asset}`)
  ).data.coins;

  return [
    {
      pool: `${usvAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project,
      symbol: 'USDC',
      tvlUsd: (+totalAssets / 1e18) * usdcPrice[`ethereum:${asset}`].price,
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
