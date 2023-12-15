const superagent = require('superagent');

const utils = require('../utils');
const { readFromS3 } = require('../../utils/s3');
// no longer needed, see note below
const farmsUrl =
  'https://api.harvest.finance/vaults?key=41e90ced-d559-4433-b390-af424fdc76d6';
const poolsUrl =
  'https://api.harvest.finance/pools?key=41e90ced-d559-4433-b390-af424fdc76d6';
const statsUrl =
  'https://api.harvest.finance/token-stats?key=41e90ced-d559-4433-b390-af424fdc76d6';
const chains = {
  eth: 'ethereum',
  matic: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
};

function aggregateBaseApys(farm, poolsResponse) {
  const farmApy = farm.estimatedApy;
  const selectedPools = poolsResponse.filter(
    (p) => p.contractAddress == farm.rewardPool
  );
  if (selectedPools.length == 0) return Number(farmApy);
  const pool = selectedPools[0];
  const poolApy = Number(pool.tradingApy);

  return Number(farmApy) + Number(poolApy);
}

function aggregateRewardApys(farm, poolsResponse) {
  const selectedPools = poolsResponse.filter(
    (p) => p.contractAddress == farm.rewardPool
  );
  if (selectedPools.length == 0) return null;
  const pool = selectedPools[0];
  const rewardApy = pool.rewardAPY.reduce((a, b) => Number(a) + Number(b), 0);

  return Number(rewardApy) > 0 ? Number(rewardApy) : null;
}

async function apy() {
  let allVaults = [];
  let specialVaults = [];

  // note (!) calling their api via aws lambda stopped working due to cloudflare bot protection.
  // instead, we use a python lambda which bypasses cloudflare
  // and stores the output to s3 (i tried node js packages, none of them worked; the repo to the
  // lambda
  const farmsResponse = (await superagent.get(farmsUrl)).body;
  const poolsResponse = (await superagent.get(poolsUrl)).body;
  const statsResponse = (await superagent.get(statsUrl)).body;
  // const data = await readFromS3('llama-apy-prod-data', 'harvest_api_data.json');
  // const farmsResponse = data['vaults'];
  // const poolsResponse = data['pools'];
  // const statsResponse = data['token-stats'];

  let specialVaultIds = ['farm-grain', 'farm-weth'];
  specialVaults = specialVaultIds.map((vaultId) => {
    const selectedPools = poolsResponse['eth'].filter((p) => p.id == vaultId);
    if (selectedPools.length == 0) return null;
    const pool = selectedPools[0];
    const rewardApy = pool.rewardAPY.reduce((a, b) => Number(a) + Number(b), 0);

    return {
      pool: pool.contractAddress,
      chain: 'Ethereum',
      project: 'harvest-finance',
      symbol: utils.formatSymbol(vaultId).replace(/[{()}]/g, ''),
      tvlUsd:
        vaultId === 'farm-weth'
          ? Number(pool.lpTokenData.liquidity)
          : Number(pool.totalValueLocked),
      apyBase: pool.tradingApy,
      apyReward: Number(rewardApy) > 0 ? Number(rewardApy) : null,
      rewardTokens: Number(rewardApy) > 0 ? pool.rewardTokens : null,
    };
  });
  // for binance inactive !== true
  for (let chain of Object.keys(chains)) {
    const activeFarms = Object.values(farmsResponse[chain]).filter(
      (v) => !v?.inactive
    );
    const farms = activeFarms.map((v) => {
      const selectedPools = poolsResponse[chain].filter(
        (p) => p.contractAddress == v.rewardPool
      );
      let rewardTokens;
      if (selectedPools.length == 0) {
        rewardTokens = null;
      } else {
        const pool = selectedPools[0];
        rewardTokens =
          pool.rewardTokens &&
          aggregateRewardApys(v, poolsResponse[chain]) != null
            ? pool.rewardTokens.flat()
            : null;
      }

      let apyBase, tvlUsd;
      if (v.vaultAddress === '0x1571eD0bed4D987fe2b498DdBaE7DFA19519F651') {
        //It's special vault for iFarm
        apyBase = Number(statsResponse.historicalAverageProfitSharingAPY);
        const iFarmPools = poolsResponse['eth'].filter(
          (p) => p.id == 'profit-sharing-farm'
        );
        tvlUsd = Number(iFarmPools[0].totalValueLocked);
      } else {
        apyBase = aggregateBaseApys(v, poolsResponse[chain]);
        tvlUsd = Number(v.totalValueLocked);
      }
      return {
        pool: v.vaultAddress,
        chain: utils.formatChain(chains[chain]),
        project: 'harvest-finance',
        symbol: v.tokenNames.join('-'),
        tvlUsd,
        apyBase,
        apyReward: aggregateRewardApys(v, poolsResponse[chain]),
        rewardTokens,
      };
    });

    allVaults = [...allVaults, ...farms];
  }

  allVaults = [...allVaults, ...specialVaults];

  return (
    allVaults
      .filter((p) => utils.keepFinite(p))
      // getting a conflict on that particular pool, removing for now until i know why
      .filter(
        (p) =>
          ![
            '0xE4E6055A7eB29F2Fa507ba7f8c4FAcc0C5ef9a2A',
            '0xd7b17297B9884Aa73BF5E6e39e3cEC107ffe6b17',
          ].includes(p.pool)
      )
  );
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harvest.finance/',
};
