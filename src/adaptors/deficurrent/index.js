const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const axios = require('axios');

const url = 'https://api.shipyard.finance';
const urlVaults = `${url}/vaults`;

const DIC_CHAIN_ID_AND_NAME = {
  43114: 'avax',
};

const getChainName = (chainId, chainName) => {
  return DIC_CHAIN_ID_AND_NAME[chainId] || chainName;
};

const getVaultTvl = async (vaults) => {
  const dicVaultIdAndResult = {};
  const coins = [];

  for (const vault of vaults) {
    const chain = getChainName(vault.chainId, vault.chain);
    coins.push(`${chain}:${vault.tokenAddress}`.toLowerCase());
  }

  const coinsData = (
    await axios.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).data.coins;

  for (const vault of vaults) {
    const want = vault.tokenAddress;
    const chain = getChainName(vault.chainId, vault.chain);

    const vaultBalance = (
      await sdk.api.abi.call({
        target: vault.vaultAddress,
        abi: abi.balance,
        chain,
      })
    ).output;

    const coinId = `${chain}:${want}`.toLowerCase();

    const coinDecimals = coinsData[coinId].decimals;
    const coinPrice = coinsData[coinId].price;

    dicVaultIdAndResult[vault.id] =
      vaultBalance * (coinPrice / 10 ** coinDecimals);
  }

  return dicVaultIdAndResult;
};

const main = async () => {
  const vaults = (await axios.get(urlVaults)).data;

  const dicVaultAndTvl = await getVaultTvl(vaults);

  const promised = vaults

    .map(async (vault) => {
      const chain = vault.chain;
      const platform = vault.platform;

      return {
        apy: vault.status === 'active' ? 100 * vault.totalApy : 0,
        chain: utils.formatChain(chain),
        pool: `${vault.shipTokenAddress}-${chain}`.toLowerCase(),
        poolMeta: platform === undefined ? null : utils.formatChain(platform),
        project: 'deficurrent',
        symbol: utils.formatSymbol(vault.id.split('-').slice(1).join('-')),
        tvlUsd: dicVaultAndTvl[vault.id],
      };
    })

    .filter((item) => item !== null)

    .flatMap((item) => item);

  return Promise.all(promised);
};

module.exports = {
  timetravel: false,
  apy: main,
  url,
};
