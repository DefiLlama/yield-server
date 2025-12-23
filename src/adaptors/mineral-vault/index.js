const utils = require('../utils');

const APY_URL = 'https://api.nest.credit/v1/vaults/nest-mineral-vault/details';
const VAULT_ADDRESS = '0x9d08946ca5856f882a56c29042fbedc5142663b9';

async function apy() {
  const res = await utils.getData(APY_URL);
  const v = res?.data;
  if (!v) return [];

  // read vault address from response (falls back to constant)
  const vaultAddress = (v?.vaultAddress || VAULT_ADDRESS).toLowerCase();

  // 7-day APY (fallback to 0)
  const apy7dSrc = v?.apy?.rolling7d;
  let apyBase = 0;

  if (apy7dSrc !== undefined && apy7dSrc !== null && apy7dSrc !== '') {
    const apy7day = Number(apy7dSrc) * 100;
    if (Number.isFinite(apy7day)) apyBase = apy7day;
  }

  // If the /apy endpoint doesn't include tvl, keep tvlUsd = 0 so adapter still returns a pool
  const tvlUsd = Number(v?.tvlUsd ?? v?.tvl ?? 0);

  return [
    {
      pool: `mineral-vault:${vaultAddress}`,
      chain: utils.formatChain('plume'),
      project: 'mineral-vault',
      symbol: 'nMNRL',
      tvlUsd,
      apyBase,
      url: 'https://app.nest.credit/vaults/nest-mineral-vault',
    },
  ];
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.nest.credit',
};
