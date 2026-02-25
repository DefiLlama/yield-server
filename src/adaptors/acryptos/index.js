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

const ZERO = '0x0000000000000000000000000000000000000000';
const valid = (o) => o?.output && o.output !== ZERO;

// Batch-resolve underlying tokens for all vaults, grouped by chain
const resolveAllUnderlyingTokens = async (vaults) => {
  const byChain = {};
  for (const v of vaults) {
    if (!byChain[v.chain]) byChain[v.chain] = [];
    byChain[v.chain].push(v);
  }

  const results = {};

  for (const [chain, chainVaults] of Object.entries(byChain)) {
    const calls = chainVaults.map((v) => ({ target: v.address }));

    // Step 1: try token0/token1 directly on vault
    // + try token() and pool() on vault
    const [directT0, directT1, tokenCall, poolCall] = await Promise.all([
      sdk.api.abi.multiCall({ abi: 'address:token0', calls, chain, permitFailure: true }),
      sdk.api.abi.multiCall({ abi: 'address:token1', calls, chain, permitFailure: true }),
      sdk.api.abi.multiCall({ abi: 'address:token', calls, chain, permitFailure: true }),
      sdk.api.abi.multiCall({ abi: 'address:pool', calls, chain, permitFailure: true }),
    ]);

    // Step 2: for vaults where direct token0/token1 failed,
    // try token0/token1 on intermediate addresses (token() or pool())
    const indirectNeeded = [];
    for (let i = 0; i < chainVaults.length; i++) {
      const hasDirect = valid(directT0.output[i]) && valid(directT1.output[i]);
      if (hasDirect) continue;

      // Prefer pool() for V3 wrappers, fall back to token() for LP wrappers
      const intermediateAddr = valid(poolCall.output[i])
        ? poolCall.output[i].output
        : valid(tokenCall.output[i])
          ? tokenCall.output[i].output
          : null;

      if (intermediateAddr) {
        indirectNeeded.push({ i, addr: intermediateAddr });
      }
    }

    let indirectT0 = {}, indirectT1 = {};
    if (indirectNeeded.length > 0) {
      const indCalls = indirectNeeded.map((n) => ({ target: n.addr }));
      const [iT0, iT1] = await Promise.all([
        sdk.api.abi.multiCall({ abi: 'address:token0', calls: indCalls, chain, permitFailure: true }),
        sdk.api.abi.multiCall({ abi: 'address:token1', calls: indCalls, chain, permitFailure: true }),
      ]);
      for (let j = 0; j < indirectNeeded.length; j++) {
        const idx = indirectNeeded[j].i;
        indirectT0[idx] = iT0.output[j];
        indirectT1[idx] = iT1.output[j];
      }
    }

    // Assemble results per vault
    for (let i = 0; i < chainVaults.length; i++) {
      const id = chainVaults[i].id;

      // Priority 1: direct token0/token1 on vault
      if (valid(directT0.output[i]) && valid(directT1.output[i])) {
        results[id] = [directT0.output[i].output, directT1.output[i].output];
        continue;
      }
      // Priority 2: indirect token0/token1 via pool() or token()
      if (valid(indirectT0[i]) && valid(indirectT1[i])) {
        results[id] = [indirectT0[i].output, indirectT1[i].output];
        continue;
      }
      // Priority 3: token() as single underlying
      if (valid(tokenCall.output[i])) {
        results[id] = [tokenCall.output[i].output];
        continue;
      }
    }
  }

  return results;
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

  // Batch-resolve underlying tokens for all vaults
  const underlyingMap = await resolveAllUnderlyingTokens(vaults);

  const pools = vaults.map((vault) => {
    const displayChain = chainDisplayNames[vault.chain] || vault.chain;

    return {
      pool: vault.id,
      chain: utils.formatChain(displayChain),
      project: 'acryptos',
      symbol: utils.formatSymbol(vault.symbol),
      poolMeta: vault.platform.charAt(0).toUpperCase() + vault.platform.slice(1),
      tvlUsd: Number(vault.tvl),
      apy: Number(vault.apy),
      underlyingTokens: underlyingMap[vault.id] || null,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.acryptos.com/',
};
