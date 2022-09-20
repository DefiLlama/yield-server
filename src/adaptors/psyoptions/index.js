const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://us-central1-psyfi-api.cloudfunctions.net/';

async function getVaultsData() {
  const vaultResponse = await axios.get(BASE_URL + 'vaults');
  if (!vaultResponse) {
    throw new Error('Unable to retrieve PsyFinance vaults from the api');
  }

  const vaults = [];
  Object.values(vaultResponse.data.vaults).map(async (vaultInfo) => {
    const vault = {
      pool: vaultInfo.id,
      chain: utils.formatChain('solana'),
      project: 'psyoptions',
      symbol: vaultInfo.id.split('-')[0],
      poolMeta: vaultInfo.id.includes('call') ? 'call' : 'put',
      tvlUsd:
        Number(vaultInfo.deposits.current) *
        (vaultInfo.collateralTokenPrice?.value || 0),
      apyBase: vaultInfo.apy.standardApy.apyBeforeFees || 0,
    };
    if (vaultInfo?.staking?.stakingApr[4]) {
      vault.apyReward = vaultInfo.staking?.stakingApr[4];
      vault.rewardTokens = ['SRM'];
    }
    vaults.push(vault);
  });
  return vaults;
}

module.exports = {
  timetravel: false,
  apy: getVaultsData,
  url: 'https://psyfi.io/vaults',
};
