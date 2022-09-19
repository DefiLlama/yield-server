const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://us-central1-psyfi-api.cloudfunctions.net/';

const getCombinedApy = (vault, lockupPeriod = 0) => {
  const stakingApr = vault.staking?.stakingApr;
  if (stakingApr?.[lockupPeriod]) {
    return vault.apy.standardApy.apyBeforeFees + stakingApr[lockupPeriod];
  }
  return vault.apy.standardApy.apyBeforeFees;
};

async function getVaultsData() {
  const vaultResponse = await axios.get(BASE_URL + 'vaults');
  if (!vaultResponse) {
    throw new Error('Unable to retrieve PsyFinance vaults from the api');
  }

  const vaults = [];

  Object.values(vaultResponse.data.vaults).map(async (vaultInfo) => {
    vaults.push({
      pool: vaultInfo.id,
      chain: utils.formatChain('solana'),
      project: 'psyfinance',
      symbol: vaultInfo.id,
      poolMeta: 'vault-v2',
      tvlUsd: Number(vaultInfo.deposits.current) * vaultInfo.valuePerVaultToken,
      apyBase: getCombinedApy(vaultInfo, 4),
    });
  });
  return vaults;
}

module.exports = {
  timetravel: false,
  apy: getVaultsData,
  url: 'https://psyfi.io/',
};
