const axios = require('axios');
const utils = require('../utils');

const BASE_URL = 'https://us-central1-psyfi-api.cloudfunctions.net/';

async function getVaultsData() {
  const vaultResponse = await axios.get(BASE_URL + 'vaults');
  if (!vaultResponse) {
    throw new Error('Unable to retrieve PsyFinance vaults from the api');
  }

  const performanceFeeRate = 0.1;
  const withdrawalFeeRate = 0.001;
  const vaults = [];
  Object.values(vaultResponse.data.vaults).map(async (vaultInfo) => {
    const currentWeekPerformance =
      utils.apyToApr(vaultInfo.apy.currentEpochApy, 52) / 52;
    const vault = {
      pool: vaultInfo.id,
      chain: utils.formatChain('solana'),
      project: 'psyoptions',
      symbol: vaultInfo.id.includes('put')
        ? 'USDC'
        : vaultInfo.id.split('-')[0].toUpperCase(),
      poolMeta: vaultInfo.id.includes('call')
        ? 'Covered Call'
        : 'Cash Secured Put',
      tvlUsd:
        Number(vaultInfo.deposits.current) *
        (vaultInfo.collateralTokenPrice?.value || 0),
      apyBase:
        vaultInfo.apy.currentEpochApy *
          (1 - (performanceFeeRate + withdrawalFeeRate)) || 0,
      il7d: currentWeekPerformance < 0 ? currentWeekPerformance : null,
    };
    if (vaultInfo?.staking?.stakingApr[0]) {
      vault.apyReward = vaultInfo.staking?.stakingApr[0];
      vault.rewardTokens = ['SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt'];
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
