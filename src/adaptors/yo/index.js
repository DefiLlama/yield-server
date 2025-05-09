const superagent = require('superagent');
const { formatChain } = require('../utils');

const API_URL = 'https://api.yo.xyz/api/v1/vault/stats';
const BASE_CHAIN_ID = 8453;
const symboToNameMap = {
  yoETH: 'Yield Optimizer ETH',
  yoBTC: 'Yield Optimizer BTC',
  yoUSD: 'Yield Optimizer USD',
};

const apy = async () => {
  const response = await superagent.get(API_URL);
  const vaults = response.body.data;

  const priceQuery = vaults
    .map((vault) => `${vault.chain.name}:${vault.asset.address}`)
    .join(',')
    .toLowerCase();

  const pricesResponse = await superagent.get(
    `https://coins.llama.fi/prices/current/${priceQuery}`
  );
  const prices = pricesResponse.body.coins;

  const result = [];
  for (const vault of vaults) {
    const pool = {
      pool: symboToNameMap[vault.name],
      chain: formatChain(vault.chain.name),
      project: 'yo',
      symbol: vault.name,
      tvlUsd:
        Number(vault.tvl.formatted) *
        Number(
          prices[`${vault.chain.name}:${vault.asset.address.toLowerCase()}`]
            .price
        ),
      apyBase: vault.yield['1d'],
      underlyingTokens: [vault.asset.address],
      url: `https://app.yo.xyz/vault/base/${vault.contracts.vaultAddress}`,
    };

    result.push(pool);
  }

  return result;
};

module.exports = { apy };
