const utils = require('../utils');

const VAULTS_URL = 'https://api5.storm.tg/api/vaults';
const TON_ADDRESS = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

const getApr = async () => {
  let vaults;
  try {
    vaults = await utils.getData(VAULTS_URL);
  } catch (e) {
    if (e.response?.status === 404) return [];
    throw e;
  }
  if (!Array.isArray(vaults)) return [];

  const priceKeys = vaults.map((v) => {
    const assetId = v.config.asset.assetId;
    return `ton:${assetId === 'TON' ? TON_ADDRESS : assetId}`;
  });

  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
    )
  ).coins;

  return vaults
    .map((vault, i) => {
      const price = prices[priceKeys[i]]?.price ?? 0;
      const apr = parseFloat(vault.apr.year);

      return {
        pool: `${vault.address}-ton`.toLowerCase(),
        chain: 'Ton',
        project: 'storm-trade',
        symbol: vault.config.asset.name,
        tvlUsd:
          ((Number(vault.freeBalance) + Number(vault.lockedBalance)) / 1e9) *
          price,
        apyBase: isNaN(apr) ? 0 : apr,
        underlyingTokens: [
          vault.config.asset.assetId === 'TON'
            ? TON_ADDRESS
            : vault.config.asset.assetId,
        ],
        url: `https://app.storm.tg/vault/${vault.config.asset.name}`,
      };
    })
    .filter((p) => p.tvlUsd > 0);
};

module.exports = {
  timetravel: false,
  apy: getApr,
  url: 'https://storm.tg/',
};
