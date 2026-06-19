const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const API_URL = 'https://api.centrifuge.io/';
const HTTP_TIMEOUT_MS = 15000;
const http = axios.create({ timeout: HTTP_TIMEOUT_MS });
const SHARE_UNIT = '1000000000000000000'; // 1e18
const DAY = 86400;

// Centrifuge API chain IDs → DefiLlama SDK chain names
// Token symbols to exclude (equity products, not yield)
const EXCLUDED_SYMBOLS = new Set(['deSPXA', 'SPXA']);

const CHAIN_MAP = {
  1: 'ethereum',
  2: 'base',
  3: 'arbitrum',
  4: 'plume_mainnet',
  5: 'avax',
  6: 'bsc',
  9: 'hyperliquid',
  10: 'optimism',
  11: 'monad',
  12: 'pharos',
};

const VAULTS_QUERY = `query($cursor: String) {
  vaults(where: { isActive: true }, limit: 200, after: $cursor) {
    items {
      id
      centrifugeId
      assetAddress
      tokenId
      token {
        name
        symbol
        decimals
        pool { name }
      }
      asset {
        symbol
        decimals
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ABIS = {
  totalAssets: 'function totalAssets() external view returns (uint256)',
  convertToAssets:
    'function convertToAssets(uint256 shares) external view returns (uint256)',
};

async function getHistoricalBlock(chain, timestamp) {
  const { data } = await http.get(
    utils.getPriceApiUrl(`/block/${chain}/${timestamp}`)
  );
  return data.height;
}

async function fetchVaults() {
  const items = [];
  let cursor = null;
  while (true) {
    const { data } = await http.post(API_URL, {
      query: VAULTS_QUERY,
      variables: { cursor },
    });
    const page = data?.data?.vaults;
    if (!page?.items) throw new Error('Unexpected GraphQL response');
    items.push(...page.items);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return items;
}

async function processChain(chain, vaults) {
  const vaultAddresses = vaults.map((v) => v.id);
  const uniqueAssets = [...new Set(vaults.map((v) => v.assetAddress))];

  // Historical blocks for APY (1d and 7d)
  const now = Math.floor(Date.now() / 1000);
  let block1d = null;
  let block7d = null;
  try {
    [block1d, block7d] = await Promise.all([
      getHistoricalBlock(chain, now - DAY),
      getHistoricalBlock(chain, now - 7 * DAY),
    ]);
  } catch (e) {
    console.error(
      `centrifuge: cannot get historical blocks for ${chain}, skipping APY:`,
      e.message
    );
  }

  // Batch on-chain reads for TVL and share prices
  const vaultCalls = vaultAddresses.map((v) => ({ target: v }));
  const sharePriceCalls = vaultAddresses.map((v) => ({
    target: v,
    params: [SHARE_UNIT],
  }));

  const [totalAssetsRes, priceNowRes, price1dRes, price7dRes] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: vaultCalls,
        abi: ABIS.totalAssets,
        chain,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: sharePriceCalls,
        abi: ABIS.convertToAssets,
        chain,
        permitFailure: true,
      }),
      block1d
        ? sdk.api.abi.multiCall({
            calls: sharePriceCalls,
            abi: ABIS.convertToAssets,
            chain,
            block: block1d,
            permitFailure: true,
          })
        : { output: vaultAddresses.map(() => ({ success: false })) },
      block7d
        ? sdk.api.abi.multiCall({
            calls: sharePriceCalls,
            abi: ABIS.convertToAssets,
            chain,
            block: block7d,
            permitFailure: true,
          })
        : { output: vaultAddresses.map(() => ({ success: false })) },
    ]);

  // Get USD prices for underlying assets
  const { pricesByAddress } = await utils.getPrices(uniqueAssets, chain);

  // Build pool objects
  const pools = [];
  for (let i = 0; i < vaults.length; i++) {
    try {
      const v = vaults[i];
      const ta = totalAssetsRes.output[i];
      const pNow = priceNowRes.output[i];
      const p1d = (price1dRes.output || [])[i] || {};
      const p7d = (price7dRes.output || [])[i] || {};

      if (!ta || !ta.success || !pNow || !pNow.success) continue;

      const decimals = v.asset?.decimals;
      if (decimals == null) continue;
      const assetSymbol = v.asset?.symbol ?? 'UNKNOWN';
      const usdPrice = pricesByAddress[v.assetAddress.toLowerCase()];
      if (!usdPrice) continue;

      const tvlUsd = (Number(ta.output) / 10 ** decimals) * usdPrice;

      // Geometric annualization of share price growth
      let apyBase = null;
      if (p1d.success && Number(p1d.output) > 0) {
        apyBase =
          (Math.pow(Number(pNow.output) / Number(p1d.output), 365) - 1) * 100;
      }

      let apyBase7d = null;
      if (p7d.success && Number(p7d.output) > 0) {
        apyBase7d =
          (Math.pow(Number(pNow.output) / Number(p7d.output), 365 / 7) - 1) *
          100;
      }

      const shareDecimals = v.token?.decimals;
      if (shareDecimals == null) continue;
      const tokenName = v.token?.name ?? v.token?.symbol ?? 'Unknown';
      const pricePerShare =
        Number(pNow.output) / 10 ** (decimals + 18 - shareDecimals);

      pools.push({
        pool: `${v.id}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'centrifuge-protocol',
        symbol: assetSymbol,
        tvlUsd,
        apyBase: apyBase7d ?? apyBase ?? null,
        apyBase7d,
        pricePerShare,
        underlyingTokens: [v.assetAddress],
        poolMeta: tokenName,
        url: 'https://app.centrifuge.io',
      });
    } catch (e) {
      console.error(
        `centrifuge: error processing vault ${vaults[i]?.id} on ${chain}:`,
        e.message
      );
    }
  }

  return pools;
}

const apy = async () => {
  const allVaults = await fetchVaults();

  // Group by chain, dedup by token per chain (one vault per share class)
  const byChain = {};
  const seenTokens = new Set();

  for (const v of allVaults) {
    const chain = CHAIN_MAP[v.centrifugeId];
    if (!chain) continue;
    if (EXCLUDED_SYMBOLS.has(v.token?.symbol)) continue;

    // Dedup: one vault per (chain, tokenId) to avoid double-counting TVL
    const key = `${chain}-${v.tokenId}`;
    if (seenTokens.has(key)) continue;
    seenTokens.add(key);

    if (!byChain[chain]) byChain[chain] = [];
    byChain[chain].push(v);
  }

  const pools = [];
  const results = await Promise.allSettled(
    Object.entries(byChain).map(([chain, vaults]) =>
      processChain(chain, vaults)
    )
  );
  for (const r of results) {
    if (r.status === 'fulfilled') pools.push(...r.value);
    else console.error('centrifuge chain failed:', r.reason?.message);
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '5948',
  timetravel: false,
  apy,
  url: 'https://app.centrifuge.io',
};
