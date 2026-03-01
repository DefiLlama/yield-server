const utils = require('../utils');
const BigNumber = require('bignumber.js');
const axios = require('axios');

const chainId = 'neutron';
const restEndpoint = 'https://rest-lb.neutron.org';

const vaults = [
  // ATOM vault
  {
    controlCenterContract: 'neutron1vk3cy35cudlpk8w9kuu9prcanc49n3ajcnu86a43ue9ln6v4v6zsaucnw9',
    vault_deposit_denom: 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9',
    origin_asset: {
      symbol: "uatom",
      display_symbol: "ATOM",
      chain: "cosmos",
      decimals: 6
    },
    url: 'https://hydro.markets/inflow/vaults/atom',
    vault_apy_endpoint: 'https://hydro.markets/api/vault/apy?vault=atom',
  },
  // WBTC vault
  {
    controlCenterContract: 'neutron1c3djqnwur4aryxe7knr4kvcm3hj2wvnl5887lc5dwsh7z40pf2cq9flznr',
    vault_deposit_denom: 'ibc/0E293A7622DC9A6439DB60E6D234B5AF446962E27CA3AB44D0590603DFF6968E',
    origin_asset: {
      symbol: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      display_symbol: "WBTC",
      chain: "ethereum",
      decimals: 8
    },
    url: 'https://hydro.markets/inflow/vaults/btc',
    vault_apy_endpoint: 'https://hydro.markets/api/vault/apy?vault=btc',
  },
  // USDC vault
  {
    controlCenterContract: 'neutron1d054u05vx29k20gqrj5h2h2lz7pl7x9fch4ypl5jmaj6q5yw4vgsgk4lx0',
    vault_deposit_denom: 'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81',
    origin_asset: {
      symbol: "uusdc",
      display_symbol: "USDC",
      chain: "noble",
      decimals: 6
    },
    url: 'https://hydro.markets/inflow/vaults/usd',
    vault_apy_endpoint: 'https://hydro.markets/api/vault/apy?vault=usdc',
  },
];

async function apy() {
  const apyData = [];

  for (const vault of vaults) {
    // Query pool info at current height
    const poolInfoCurrent = await queryContract(
      restEndpoint,
      vault.controlCenterContract,
      { pool_info: {} },
    );

    // Calculate TVL
    const totalLockedTokens = new BigNumber(poolInfoCurrent.total_pool_value).shiftedBy(-vault.origin_asset.decimals);
    const prices = await utils.getPrices([vault.origin_asset.symbol], vault.origin_asset.chain);
    const price = new BigNumber(prices.pricesByAddress[vault.origin_asset.symbol.toLowerCase()]);
    const tvlUsd = totalLockedTokens.times(price).toNumber();

    // Fetch APY data from the vault's API endpoint
    const vaultAPYs = await getVaultAPYs(vault.vault_apy_endpoint);

    apyData.push({
          pool: `${vault.controlCenterContract}-${chainId}`.toLowerCase(),
          symbol: vault.origin_asset.display_symbol,
          underlyingTokens: [vault.vault_deposit_denom],
          project: 'hydro-inflow',
          chain: utils.formatChain(chainId),
          tvlUsd: tvlUsd,
          apyBase7d: vaultAPYs.apy7d,
          apyBase: vaultAPYs.apy14d,
          url: vault.url,
        });
  }

  return apyData;
}

async function queryContract(api, contract, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  const encodedData = Buffer.from(data).toString('base64');
  const endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}`;

  const result = await axios.get(endpoint, { });
  return result.data.data;
}

async function getVaultAPYs(vault_apy_endpoint) {
  const result = await utils.getData(vault_apy_endpoint);
  return {
    apy7d: result.avg_7_days * 100,
    apy14d: result.overall_average * 100
  };
}

module.exports = {
  apy,
  timetravel: false,
  url: 'https://hydro.markets/',
};
