const axios = require('axios');
const utils = require('../utils');

const CHAINS = {
  bsc: 'bsc',
  linea: 'linea',
};

const getUrl = (chain) =>
  `https://stats-kixqx.ondigitalocean.app/vaults?chain=${chain}`;

const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const getApy = async () => {
  const vaultsData = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => {
        const response = await axios.get(getUrl(CHAINS[chain]));
        const vaultData = response.data.data;
        return [chain, vaultData];
      })
    )
  );

  const pools = Object.keys(CHAINS).map((chain) => {
    return {
      pool: `${vaultsData[chain].vaultAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'clip-finance',
      symbol: vaultsData[chain].symbol,
      tvlUsd: vaultsData[chain].tvlUsd || 0,
      apy: vaultsData[chain].apy,
      underlyingTokens: vaultsData[chain].underlyingTokens,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://clip.finance/',
};
