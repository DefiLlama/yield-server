const axios = require('axios');
const utils = require('../utils');

const VAULTS_API = 'https://yldfi.co/api/vaults';
const KONG_API = 'https://kong.yearn.farm/api/gql';

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
        net
      }
    }
  }
`;

const getApy = async () => {
  // Fetch vault addresses dynamically, only strategy vaults (ys-prefix)
  const { data: vaultData } = await axios.get(VAULTS_API);
  const strategyAddresses = Object.entries(vaultData)
    .filter(([key, v]) => key.startsWith('ys') && v && typeof v === 'object' && v.address)
    .map(([, v]) => v.address);

  if (strategyAddresses.length === 0) return [];

  const response = await axios.post(KONG_API, {
    query,
    variables: { addresses: strategyAddresses },
  });

  const vaults = response.data?.data?.vaults || [];

  return vaults.map((vault) => ({
    pool: `${vault.address}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'yld',
    symbol: vault.asset.symbol,
    tvlUsd: vault.tvl.close,
    apyBase: vault.apy.net * 100,
    underlyingTokens: [vault.asset.address],
    url: `https://yldfi.co/vaults/${vault.symbol.toLowerCase()}`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yldfi.co',
};
