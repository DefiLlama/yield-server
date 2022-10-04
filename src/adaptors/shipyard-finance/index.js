const utils = require('../utils');

const url = 'https://api.shipyard.finance';
const urlVaults = `${url}/vaults`;

const mapNetworkAndName = {
  1: 'ethereum',
  42161: 'arbitrum',
  43114: 'avalanche',
};

const main = async () => {
  const vaults = await utils.getData(urlVaults);

  return Array.from(Object.keys(mapNetworkAndName))

    .map(chainId => {

      return vaults

        .filter(vault => vault.chainId === Number(chainId))

        .map(vault => {

          const networkName = mapNetworkAndName[chainId];
          const platform = vault.platform;

          return {
            apy: vault.status === 'active' ? 100 * vault.totalApy : 0,
            chain: utils.formatChain(networkName),
            pool: `${vault.shipTokenAddress}-${networkName}`.toLowerCase(),
            poolMeta: platform === undefined ? null : utils.formatChain(platform),
            project: 'shipyard-finance',
            symbol: utils.formatSymbol(vault.id.split('-').slice(1).join('-')),
            tvlUsd: vault.tvlUsd,
          };
        })

        .filter(item => item !== null)
    })

    .flatMap(item => item)
};

module.exports = {
  timetravel: false,
  apy: main,
  url
};
