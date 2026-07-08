const sdk = require('@defillama/sdk');
const axios = require('axios');

const { getPriceApiData } = require('../utils');

const MORPHO_GRAPH_URL = 'https://api.morpho.org/graphql';

const USDS = '0xdC035D45d973E3EC169d2276DDab16f1e407384F';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Morpho Vault V2 products curated by sky.money (Risk Curator). The
// morpho-blue adapter lists these vaults under Morpho's frontend
// (`morpho-vault-v2-<address>-<chain>` pool ids); these rows dual-list the
// same vaults behind the curator's own frontend — the established
// convention for one row per frontend (e.g. sUSDS on Arbitrum is listed by
// both sky-lending and spark-savings).
const VAULTS = [
  {
    address: '0xE15fcC81118895b67b6647BBd393182dF44E11E0',
    asset: USDS,
    symbol: 'USDS',
    poolMeta: 'Flagship Vault',
  },
  {
    address: '0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11',
    asset: USDT,
    symbol: 'USDT',
    poolMeta: 'Savings Vault',
  },
  {
    address: '0x56bfa6f53669B836D1E0Dfa5e99706b12c373ecf',
    asset: USDC,
    symbol: 'USDC',
    poolMeta: 'Risk Capital Vault',
  },
  {
    address: '0xf42bca228D9bd3e2F8EE65Fec3d21De1063882d4',
    asset: USDS,
    symbol: 'USDS',
    poolMeta: 'Risk Capital Vault',
  },
  {
    address: '0x2bD3A43863c07B6A01581FADa0E1614ca5DF0E3d',
    asset: USDT,
    symbol: 'USDT',
    poolMeta: 'Risk Capital Vault',
  },
];

const VAULT_QUERY = `
  query GetVaultV2($address: String!, $chainId: Int!) {
    vaultV2ByAddress(address: $address, chainId: $chainId) {
      netApyDay: avgNetApy(lookback: ONE_DAY)
      baseApyDay: avgNetApyExcludingRewards(lookback: ONE_DAY)
      rewards {
        asset {
          address
        }
        supplyApr
      }
    }
  }
`;

const fetchVaultState = async (address) => {
  try {
    const res = await axios.post(
      MORPHO_GRAPH_URL,
      { query: VAULT_QUERY, variables: { address, chainId: 1 } },
      { timeout: 10000 }
    );
    return res.data.data.vaultV2ByAddress;
  } catch (err) {
    // one failing vault lookup drops that row only, not the whole adapter
    return null;
  }
};

const apy = async () => {
  const priceKeys = [...new Set(VAULTS.map((v) => `ethereum:${v.asset}`))].join(
    ','
  );
  const [prices, decimalsRes, totalAssetsRes] = await Promise.all([
    getPriceApiData(`/prices/current/${priceKeys}`).then((r) => r.coins),
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: VAULTS.map((v) => ({ target: v.asset })),
      chain: 'ethereum',
    }),
    sdk.api.abi.multiCall({
      abi: 'uint256:totalAssets',
      calls: VAULTS.map((v) => ({ target: v.address })),
      chain: 'ethereum',
    }),
  ]);
  const decimals = decimalsRes.output.map((o) => o.output);
  const totalAssets = totalAssetsRes.output.map((o) => o.output);

  const pools = await Promise.all(
    VAULTS.map(async (vault, i) => {
      const price = prices[`ethereum:${vault.asset}`]?.price;
      if (!price) return null;

      const state = await fetchVaultState(vault.address);
      if (!state || state.netApyDay == null || state.baseApyDay == null)
        return null;

      const dec = Number(decimals[i]);
      const assets = Number(totalAssets[i]);
      if (!Number.isFinite(dec) || !Number.isFinite(assets)) return null;

      const rewardApr =
        state.rewards?.reduce(
          (sum, r) => sum + (r.supplyApr > 0 ? r.supplyApr : 0),
          0
        ) || 0;
      const rewardTokens = (state.rewards || [])
        .filter((r) => r.supplyApr > 0)
        .map((r) => r.asset.address);

      const tvlUsd = (assets / Math.pow(10, dec)) * price;

      return {
        pool: `${vault.address.toLowerCase()}-ethereum`,
        chain: 'ethereum',
        project: 'sky-money',
        symbol: vault.symbol,
        token: vault.address,
        poolMeta: vault.poolMeta,
        tvlUsd,
        apyBase: state.baseApyDay * 100,
        apyReward: rewardApr > 0 ? rewardApr * 100 : null,
        rewardTokens: rewardTokens.length ? rewardTokens : null,
        underlyingTokens: [vault.asset],
        url: `https://app.sky.money/?network=ethereum&widget=vaults&vault_module=morpho&vault=${vault.address}&flow=supply`,
      };
    })
  );

  return pools.filter(Boolean);
};

module.exports = {
  protocolId: '7883',
  apy,
  url: 'https://app.sky.money/?network=ethereum&widget=vaults',
};
