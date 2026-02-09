const sdk = require('@defillama/sdk');
const utils = require('../utils');

const urlApi = 'https://api.unrekt.net/api/v2/acryptos-asset.json';

const chainMapping = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bsc',
  25: 'cronos',
  100: 'xdai',
  137: 'polygon',
  250: 'fantom',
  592: 'astar',
  1284: 'moonbeam',
  1285: 'moonriver',
  2222: 'kava',
  7700: 'canto',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avax',
  59144: 'linea',
  1666600000: 'harmony',
};

// Display name mapping for chain formatting
const chainDisplayNames = {
  bsc: 'binance',
  avax: 'avalanche',
};

// Fetch underlying token from vault using token() method
const getVaultToken = async (vaultAddress, chain) => {
  try {
    const result = await sdk.api.abi.call({
      target: vaultAddress,
      abi: 'address:token',
      chain,
    });
    if (result.output && result.output !== '0x0000000000000000000000000000000000000000') {
      return [result.output];
    }
  } catch (e) {
    // Vault might not have token() method
  }
  return undefined;
};

const fetch = (dataTvl, chainMapping) => {
  const data = [];

  for (const chainId of Object.keys(chainMapping)) {
    const poolData = dataTvl[chainId];

    if (poolData === undefined) continue;

    for (const [addr, details] of Object.entries(poolData)) {
      if (details.status === 'deprecated') {
        continue;
      }
      data.push({
        id: `acryptos-${chainId}${addr}`,
        address: addr,
        network: chainId,
        chain: chainMapping[chainId],
        symbol: details.tokensymbol,
        tvl: details.tvl_usd,
        apy: details.apytotal,
        platform: details.platform,
      });
    }
  }
  return data;
};

const main = async () => {
  const dataApi = await utils.getData(urlApi);
  const vaults = fetch(dataApi.assets, chainMapping);

  // Fetch underlying tokens for all vaults in parallel
  const poolsWithTokens = await Promise.all(
    vaults.map(async (vault) => {
      const underlyingTokens = await getVaultToken(vault.address, vault.chain);
      const displayChain = chainDisplayNames[vault.chain] || vault.chain;

      return {
        pool: vault.id,
        chain: utils.formatChain(displayChain),
        project: 'acryptos',
        symbol: utils.formatSymbol(vault.symbol),
        poolMeta: vault.platform.charAt(0).toUpperCase() + vault.platform.slice(1),
        tvlUsd: Number(vault.tvl),
        apy: Number(vault.apy),
        underlyingTokens,
      };
    })
  );

  return poolsWithTokens.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.acryptos.com/',
};
