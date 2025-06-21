const superagent = require('superagent');
const { formatChain, getPrices, getERC4626Info } = require('../utils');

const PROJECT_NAME = 'yo-protocol';
const API_URL = 'https://api.yo.xyz/api/v1/vault/stats';
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

  const prices = await getPrices(
    vaults.map((vault) => vault.asset.address),
    'base'
  );

  const tvls = await Promise.all(
    vaults.map((vault) =>
      getERC4626Info(
        vault.contracts.vaultAddress.toLowerCase(),
        vault.chain.name
      )
    )
  );

  const tvlByAddress = tvls.reduce((acc, tvl) => {
    acc[tvl.pool.toLowerCase()] = tvl.tvl;
    return acc;
  }, {});

  const result = [];
  for (const vault of vaults) {
    const normalizedTvl =
      tvlByAddress[vault.contracts.vaultAddress.toLowerCase()] /
      10 ** vault.asset.decimals;

    const tvlUsd =
      normalizedTvl *
      Number(prices.pricesByAddress[vault.asset.address.toLowerCase()]);

    const pool = {
      pool: vault.contracts.vaultAddress,
      chain: formatChain(vault.chain.name),
      project: PROJECT_NAME,
      symbol: vault.name,
      tvlUsd: tvlUsd,
      apyBase: Number(vault.yield['1d']),
      underlyingTokens: [vault.asset.address],
      url: `https://app.yo.xyz/vault/base/${vault.contracts.vaultAddress}`,
    };

    result.push(pool);
  }

  return result;
};

module.exports = { apy };
