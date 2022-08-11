const axios = require('axios');
const utils = require('../utils');

// matches the mapping on the frontend and
// imo is much easier to understand than poolId
const voltTypeMapping = {
  1: 'Covered Call',
  2: 'Cash Secured Put',
  3: 'Crab Strategy',
  4: 'Basis Yield',
};

async function tvl() {
  const friktionSnapshotResponse = await axios.get(
    'https://raw.githubusercontent.com/Friktion-Labs/mainnet-tvl-snapshots/main/friktionSnapshot.json'
  );

  const friktionSnapshot = friktionSnapshotResponse.data;
  const poolsTvl = friktionSnapshot.usdValueByGlobalId;
  const volts = friktionSnapshot.allMainnetVolts;

  const pools = [];

  if (
    !(
      friktionSnapshot &&
      volts &&
      poolsTvl &&
      typeof friktionSnapshot === 'object' &&
      typeof volts === 'object' &&
      typeof poolsTvl === 'object'
    )
  ) {
    console.log(friktionSnapshot);
    throw new Error('Unexpected response from friktionSnapshot');
  }

  for (let i = 0; i < volts.length; i += 1) {
    const currentVolt = volts[i];
    const poolId = currentVolt.globalId;
    const voltType = currentVolt.voltType;
    const poolObj = {
      pool: currentVolt.voltVaultId,
      chain: utils.formatChain('solana'),
      project: 'friktion',
      symbol: `${currentVolt.depositTokenSymbol} (${voltTypeMapping[voltType]})`,
      tvlUsd: Number(poolsTvl[poolId]),
      apyBase: currentVolt.apy,
    };
    pools.push(poolObj);
  }
  return pools;
}

module.exports = {
  timetravel: false,
  apy: tvl,
  url: 'https://app.friktion.fi/',
};
