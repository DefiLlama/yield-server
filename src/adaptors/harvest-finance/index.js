const superagent = require('superagent');
const cloudscraper = require('cloudscraper');

const utils = require('../utils');
const farmsUrl =
  'https://api.harvest.finance/vaults?key=41e90ced-d559-4433-b390-af424fdc76d6';
const poolsUrl =
  'https://api.harvest.finance/pools?key=41e90ced-d559-4433-b390-af424fdc76d6';
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
  const farmsResponse = JSON.parse(await cloudscraper.get(farmsUrl));
  const poolsResponse = JSON.parse(await cloudscraper.get(poolsUrl));

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

  return allVaults.filter((p) => utils.keepFinite(p));
}

const main = async () => {
  return await apy();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.harvest.finance/',
};
