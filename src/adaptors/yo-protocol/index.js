const superagent = require('superagent');
const { formatChain, getPrices, getERC4626Info } = require('../utils');
const { getVaultReward } = require('./services');

const PROJECT_NAME = 'yo-protocol';
const API_URL = 'https://api.yo.xyz/api/v1/vault/stats';
const MERKL_API_URL =
  'https://api.merkl.xyz/v4/opportunities/?creatorAddress=0xd7A77013933A97A2c08dad7d59937119E76C879a&status=LIVE&chainName=Base';
const symboToNameMap = {
  yoETH: 'Yield Optimizer ETH',
  yoBTC: 'Yield Optimizer BTC',
  yoUSD: 'Yield Optimizer USD',
  yoEUR: 'Yield Optimizer EUR',
  yoGOLD: 'Yield Optimizer GOLD',
};

const apy = async () => {
  const response = await superagent.get(API_URL);
  const vaults = response.body.data;

  const priceQuery = vaults
    .map((vault) => `${vault.chain.name}:${vault.asset.address}`)
    .join(',')
    .toLowerCase();

  const prices = await getPrices(
    vaults.map((vault) => `${vault.chain.name}:${vault.asset.address}`)
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

  // Fetch vault rewards
  const vaultRewardMap = await getVaultReward(MERKL_API_URL);

  const result = [];
  for (const vault of vaults) {
    const normalizedTvl =
      tvlByAddress[vault.contracts.vaultAddress.toLowerCase()] /
      10 ** vault.asset.decimals;

    const tvlUsd =
      normalizedTvl *
      Number(prices.pricesByAddress[vault.asset.address.toLowerCase()]);

    const vaultReward = vaultRewardMap.get(
      vault.contracts.vaultAddress.toLowerCase()
    );

    const pool = {
      pool: vault.contracts.vaultAddress,
      chain: formatChain(vault.chain.name),
      poolMeta: vault.name,
      project: PROJECT_NAME,
      symbol: vault.asset.symbol,
      tvlUsd: tvlUsd,
      apyBase: Number(vault.yield['1d']),
      underlyingTokens: [vault.asset.address],
      url: `https://app.yo.xyz/vault/${vault.chain.name}/${vault.contracts.vaultAddress}`,
      ...(vaultReward && {
        apyReward: Number(vaultReward.apr),
        rewardTokens: [vault.asset.address],
      }),
    };

    result.push(pool);
  }

  return result;
};

module.exports = { apy };
