const utils = require('../utils');

const dappUrl = 'https://app.goat.fi';
const url = 'https://api.goat.fi';
const urlMeta = `${url}/vaults`;

const networkMapping = {
    1: 'ethereum',
    10: 'optimism',
    56: 'bsc',
    100: 'gnosis',
    137: 'polygon',
    146: 'sonic',
    252: 'fraxtal',
    324: 'zksync',
    1101: 'polygon_zkevm',
    5000: 'mantle',
    8453: 'base',
    34443: 'mode',
    42161: 'arbitrum',
    42220: 'celo',
    43114: 'avalanche',
    59144: 'linea',
  };

const main = async () => {
    const meta = await utils.getData(urlMeta);

    const data = [];
    for (const chain of Object.keys(meta.data)) {
        for (const vaultName in meta.data[Number(chain)]) {
            const vault = meta.data[Number(chain)][vaultName];
  
            data.push({
            pool: `${vault.address}-${networkMapping[chain]}`.toLowerCase(),
            chain: utils.formatChain(networkMapping[chain]),
            project: 'goat-protocol',
            symbol: utils.formatSymbol(vault.asset.symbol),
            tvlUsd: vault.tvl,
            apy: vault.apy * 100,
            underlyingTokens: [vault.asset.address],
            url: `${dappUrl}/vault/${networkMapping[chain]}/${vaultName}`
            });
      }
    }
  
    return utils.removeDuplicates(data);
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://goat.fi/',
};
