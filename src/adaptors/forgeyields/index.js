const sdk = require('@defillama/sdk');
const axios = require('axios');

// Provide a public Starknet RPC fallback for environments where the
// STARKNET_RPC secret isn't exposed (e.g. PR CI). Production cron sets the
// env var explicitly; this only kicks in when it's missing.
if (!process.env.STARKNET_RPC) {
  process.env.STARKNET_RPC = 'https://rpc.starknet.lava.build';
}
const utils = require('../utils');
const { call: starknetCall } = utils;

const API_URL = 'https://api.forgeyields.com/strategies';

const underlyingTokens = {
  ethereum: {
    ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  starknet: {
    ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
    USDC: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
    WBTC: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
  },
};

const STARKNET_TOTAL_ASSETS_PROVIDER =
  '0x2d0ee5bf4445712c414d58544c9d522a537e4292fa3c3ad36e68bd177a378b8';
const ETHEREUM_TOTAL_ASSETS_PROVIDER =
  '0x5d77Ef1B3e419ceca9e48be33B6600F997993DD6';

const starknetTotalAssetsAbi = {
  type: 'function',
  name: 'total_assets',
  inputs: [
    {
      name: 'token_gateway',
      type: 'core::starknet::contract_address::ContractAddress',
    },
  ],
  outputs: [{ type: 'core::integer::u256' }],
  state_mutability: 'view',
  customInput: 'address',
};

const DAY = 24 * 3600;
const YEAR = 365 * DAY;
// ForgeYields strategies report (rebalance) on a ~24h cadence with up to
// ~10min of late-reporting slack, so the most recent report lands around
// `now - 23h50m`. By offsetting the lookback windows back by 1h
// (tYest = now-25h, t7d = now-7d-1h) we ensure pYest / p7d fall *before*
// that report — so pYest reflects the previous cycle and pNow the latest,
// capturing exactly one (resp. seven) full yield cycle(s) in the ratio.
// Using `now - 24h` directly would risk placing both samples inside the
// same cycle (pNow/pYest ≈ 1 → APY ≈ 0). The `^(YEAR / Δt)` annualization
// below correctly handles the resulting ~25h vs 24h denominator bias.
const REPORT_MARGIN = 60 * 60;
const SHARE_UNIT = '1000000000000000000'; // 1e18 shares
const convertToAssetsAbi =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const getBlock = async (timestamp, chain = 'ethereum') => {
  const data = await utils.getPriceApiData(`/block/${chain}/${timestamp}`);
  return data.height;
};

const convertToAssetsAt = async (target, block) => {
  const r = await sdk.api.abi.call({
    target,
    block,
    abi: convertToAssetsAbi,
    params: [SHARE_UNIT],
    chain: 'ethereum',
  });
  return Number(r.output);
};

// Compute apyBase (1d) and apyBase7d onchain on the Ethereum gateway.
// The same vault logic runs on both chains, so the resulting APR is reused
// for the Starknet pool of the same strategy.
const getOnchainApy = async (ethereumGateway) => {
  const tNow = Math.floor(Date.now() / 1e3);
  const tYest = tNow - DAY - REPORT_MARGIN;
  const t7d = tNow - 7 * DAY - REPORT_MARGIN;
  const [bNow, bYest, b7d] = await Promise.all(
    [tNow, tYest, t7d].map((t) => getBlock(t))
  );
  const [pNow, pYest, p7d] = await Promise.all([
    convertToAssetsAt(ethereumGateway, bNow),
    convertToAssetsAt(ethereumGateway, bYest),
    convertToAssetsAt(ethereumGateway, b7d),
  ]);
  // Annualize over the actual elapsed time (not exactly 1d / 7d due to the margin).
  return {
    apyBase: (pNow / pYest) ** (YEAR / (tNow - tYest)) * 100 - 100,
    apyBase7d: (pNow / p7d) ** (YEAR / (tNow - t7d)) * 100 - 100,
  };
};

const apy = async () => {
  const strategies = await utils.getData(API_URL);

  const priceKeys = new Set();
  for (const s of strategies) {
    for (const gw of s.token_gateway_per_domain) {
      const chain = gw.domain.toLowerCase();
      const addr = underlyingTokens[chain]?.[s.underlyingSymbol];
      if (addr) priceKeys.add(`${chain}:${addr}`);
    }
  }
  const priceData = await utils.getPriceApiData(`/prices/current/${[...priceKeys].join(',')}`);
  const prices = priceData.coins;

  // Per-strategy Ethereum gateway -> compute shared APY + Ethereum TVL onchain
  const ethEntries = strategies
    .map((s) => {
      const gw = s.token_gateway_per_domain.find(
        (d) => d.domain.toLowerCase() === 'ethereum'
      );
      return gw ? { strategy: s, gateway: gw.token_gateway } : null;
    })
    .filter(Boolean);

  const apyResults = await Promise.all(
    ethEntries.map(({ gateway }) =>
      getOnchainApy(gateway).catch(() => ({
        apyBase: undefined,
        apyBase7d: undefined,
      }))
    )
  );

  // Gateways don't expose ERC-4626 `totalAssets()` directly; query the provider
  // (mirrors the DefiLlama-Adapters TVL adapter).
  const ethTotalAssets = await sdk.api.abi.multiCall({
    abi: 'function totalAssets(address tokenGateway) view returns (uint256)',
    target: ETHEREUM_TOTAL_ASSETS_PROVIDER,
    calls: ethEntries.map(({ gateway }) => ({ params: [gateway] })),
    chain: 'ethereum',
    permitFailure: true,
  });

  // Per-strategy Starknet gateway -> Starknet TVL onchain (mirrors DefiLlama-Adapters)
  const snEntries = strategies
    .map((s) => {
      const gw = s.token_gateway_per_domain.find(
        (d) => d.domain.toLowerCase() === 'starknet'
      );
      return gw ? { strategy: s, gateway: gw.token_gateway } : null;
    })
    .filter(Boolean);

  const snTotalAssets = await Promise.all(
    snEntries.map(({ gateway }) =>
      starknetCall({
        abi: starknetTotalAssetsAbi,
        target: STARKNET_TOTAL_ASSETS_PROVIDER,
        params: [gateway],
      }).catch(() => null)
    )
  );

  // strategy.symbol -> { apyBase, apyBase7d }
  const apyByStrategy = {};
  ethEntries.forEach((e, i) => {
    apyByStrategy[e.strategy.symbol] = apyResults[i];
  });

  // `${strategy.symbol}-${chain}` -> tvlUsd
  const tvlUsdByPool = {};
  ethEntries.forEach((e, i) => {
    const raw = ethTotalAssets.output[i]?.output;
    const addr = underlyingTokens.ethereum[e.strategy.underlyingSymbol];
    const price = addr ? prices[`ethereum:${addr}`] : null;
    if (raw == null || !price) return;
    const amount = Number(raw.toString()) / 10 ** price.decimals;
    tvlUsdByPool[`${e.strategy.symbol}-ethereum`] = amount * price.price;
  });
  snEntries.forEach((e, i) => {
    const raw = snTotalAssets[i];
    const addr = underlyingTokens.starknet[e.strategy.underlyingSymbol];
    const price = addr ? prices[`starknet:${addr}`] : null;
    if (raw == null || !price) return;
    // starknet helper returns a BN for u256; .toString() then Number is precision-safe
    // once the value is divided by the token's decimals.
    const amount = Number(raw.toString()) / 10 ** price.decimals;
    tvlUsdByPool[`${e.strategy.symbol}-starknet`] = amount * price.price;
  });

  const pools = [];
  for (const s of strategies) {
    const { apyBase, apyBase7d } = apyByStrategy[s.symbol] || {};
    for (const gw of s.token_gateway_per_domain) {
      const chain = gw.domain.toLowerCase();
      const addr = underlyingTokens[chain]?.[s.underlyingSymbol];
      if (!addr) continue;

      pools.push({
        pool: `${gw.token_gateway}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'forgeyields',
        symbol: s.underlyingSymbol,
        tvlUsd: tvlUsdByPool[`${s.symbol}-${chain}`],
        apyBase,
        apyBase7d,
        poolMeta: s.symbol,
        url: `https://app.forgeyields.com/opportunities/${s.symbol}`,
        token: gw.token_gateway,
        underlyingTokens: [addr],
        searchTokenOverride: gw.token_gateway,
      });
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '6797',
  timetravel: false,
  apy,
  url: 'https://app.forgeyields.com',
};
