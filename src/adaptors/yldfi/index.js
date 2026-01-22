const axios = require('axios');
const utils = require('../utils');

// yldfi strategy vault addresses (excluding wrapper vaults to avoid double counting)
const VAULT_ADDRESSES = [
  '0xCa960E6DF1150100586c51382f619efCCcF72706', // yscvxCRV
  '0x8ED5AB1BA2b2E434361858cBD3CA9f374e8b0359', // yscvgCVX
];

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
  const response = await axios.post(KONG_API, {
    query,
    variables: { addresses: VAULT_ADDRESSES },
  });

  const vaults = response.data?.data?.vaults || [];

  return vaults.map((vault) => ({
    pool: `${vault.address}-ethereum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'yldfi',
    symbol: vault.asset.symbol,
    tvlUsd: vault.tvl.close,
    apyBase: vault.apy.net * 100, // Convert to percentage
    underlyingTokens: [vault.asset.address],
    url: `https://yldfi.co/vaults/${vault.symbol.toLowerCase()}`,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yldfi.co',
};
