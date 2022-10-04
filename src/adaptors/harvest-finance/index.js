const superagent = require('superagent');

const utils = require('../utils');
const { readFromS3 } = require('../../utils/s3');
// no longer needed, see note below
// const farmsUrl =
//   'https://api.harvest.finance/vaults?key=41e90ced-d559-4433-b390-af424fdc76d6';
// const poolsUrl =
//   'https://api.harvest.finance/pools?key=41e90ced-d559-4433-b390-af424fdc76d6';
const chains = {
  bsc: 'binance',
  eth: 'ethereum',
  matic: 'polygon',
};

function aggregateApys(farm, poolsResponse) {
  const farmApy = farm.estimatedApy;
  const selectedPools = poolsResponse.filter(
    (p) => p.contractAddress == farm.rewardPool
  );
  if (selectedPools.length == 0) return farmApy;
  const pool = selectedPools[0];
  const poolApy =
    Number(pool.tradingApy) +
    pool.rewardAPY.reduce((a, b) => Number(a) + Number(b), 0);
  return Number(farmApy) + Number(poolApy);
}

async function apy() {
  let allVaults = [];

  // note (!) calling their api via aws lambda stopped working due to cloudflare bot protection.
  // instead, we use a python lambda which bypasses cloudflare
  // and stores the output to s3 (i tried node js packages, none of them worked; the repo to the
  // lambda:
  // const farmsResponse = (await superagent.get(farmsUrl)).body;
  // const poolsResponse = (await superagent.get(poolsUrl)).body;
  const data = await readFromS3('llama-apy-prod-data', 'harvest_api_data.json');
  const farmsResponse = data['vaults'];
  const poolsResponse = data['pools'];

  // for binance inactive !== true
  for (let chain of Object.keys(chains)) {
    const activeFarms = Object.values(farmsResponse[chain]).filter(
      (v) => !v.category?.includes('INACTIVE')
    );
    const farms = activeFarms.map((v) => {
      const s = v.displayName.split(' ');
      const symbol = s.length > 2 ? s[2] : s.length > 1 ? s[1] : s[0];
      s[0];

      return {
        pool: v.vaultAddress,
        chain: utils.formatChain(chains[chain]),
        project: 'harvest-finance',
        symbol: utils.formatSymbol(symbol),
        poolMeta: s.length > 1 ? s[0].replace(':', '') : null,
        tvlUsd: Number(v.totalValueLocked),
        apy: aggregateApys(v, poolsResponse[chain]),
      };
    });

    allVaults = [...allVaults, ...farms];
  }

  return (
    allVaults
      .filter((p) => utils.keepFinite(p))
      // getting a conflict on that particular pool, removing for now until i know why
      .filter((p) => p.pool !== '0xE4E6055A7eB29F2Fa507ba7f8c4FAcc0C5ef9a2A')
  );
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harvest.finance/',
};
