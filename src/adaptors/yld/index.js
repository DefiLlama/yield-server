const axios = require('axios');

const VAULTS_API = 'https://yldfi.co/api/vaults';
const KONG_API = 'https://kong.yearn.farm/api/gql';
// Vault keys use 'ys' prefix (strategy) or 'y' prefix (wrapper)
const VAULT_PREFIXES = ['ys', 'y'];

const query = `
  query GetVaults($addresses: [String!]!) {
    vaults(chainId: 1, addresses: $addresses) {
      address
      name
      symbol
      asset {
        address
        symbol
      }
      tvl {
        close
      }
      apy {
        weeklyNet
      }
    }
  }
`;

const getApy = async () => {
  // Fetch vault addresses dynamically (wrapper + strategy vaults)
  const { data: vaultData } = await axios.get(VAULTS_API, { timeout: 10000 });
  const vaultAddresses = Object.entries(vaultData)
    .filter(
      ([key, v]) =>
        VAULT_PREFIXES.some((p) => key.startsWith(p)) &&
        v &&
        typeof v === 'object' &&
        v.address
    )
    .map(([, v]) => v.address);

  if (vaultAddresses.length === 0) return [];

  const response = await axios.post(
    KONG_API,
    { query, variables: { addresses: vaultAddresses } },
    { timeout: 10000 }
  );

  const vaults = (response.data?.data?.vaults || []).filter(
    (vault) =>
      vault?.address &&
      vault?.symbol &&
      vault?.asset?.address &&
      vault?.asset?.symbol &&
      Number.isFinite(Number(vault?.tvl?.close)) &&
      Number.isFinite(Number(vault?.apy?.weeklyNet))
  );

  return vaults.map((vault) => ({
    pool: `${vault.address}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'yld',
    symbol: vault.symbol,
    tvlUsd: Number(vault.tvl.close),
    apyBase: Number(vault.apy.weeklyNet) * 100,
    underlyingTokens: [vault.asset.address],
    url: `https://yldfi.co/vaults/${vault.symbol.toLowerCase()}`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yldfi.co',
};
