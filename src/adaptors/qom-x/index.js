const sdk = require('@defillama/sdk');
const { formatChain } = require('../utils');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';

const abi = {
  getAllFarms: 'function getAllFarms() view returns (address[])',
  lpToken: 'address:lpToken',
  rewardToken: 'address:rewardToken',
  totalStaked: 'uint256:totalStaked',
  rewardPerSecond: 'uint256:rewardPerSecond',
  endTime: 'uint256:endTime',
  startTime: 'uint256:startTime',
};

async function apy() {
  // 1. Get all farm addresses
  const farms = (
    await sdk.api.abi.call({
      target: FARM_FACTORY,
      abi: abi.getAllFarms,
      chain: CHAIN,
    })
  ).output;

  if (!farms || farms.length === 0) return [];

  // 2. Get basic info from each farm
  const [lpTokens, rewardTokens, totalStakeds, rewardPerSeconds, endTimes] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: farms.map((f) => ({ target: f, params: [] })),
        abi: abi.lpToken,
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: farms.map((f) => ({ target: f, params: [] })),
        abi: abi.rewardToken,
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: farms.map((f) => ({ target: f, params: [] })),
        abi: abi.totalStaked,
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: farms.map((f) => ({ target: f, params: [] })),
        abi: abi.rewardPerSecond,
        chain: CHAIN,
      }),
      sdk.api.abi.multiCall({
        calls: farms.map((f) => ({ target: f, params: [] })),
        abi: abi.endTime,
        chain: CHAIN,
      }),
    ]);

  const pools = [];

  for (let i = 0; i < farms.length; i++) {
    const farm = farms[i];
    const lpToken = lpTokens.output[i].output;
    const rewardToken = rewardTokens.output[i].output;
    const totalStaked = totalStakeds.output[i].output;
    const rewardPerSecond = rewardPerSeconds.output[i].output;
    const endTime = Number(endTimes.output[i].output);

    // Skip finished farms
    if (Date.now() / 1000 > endTime) continue;

    // Get TVL in USD (using DefiLlama price helper)
    const lpPrice = await utils.getPrices([`${CHAIN}:${lpToken}`]);
    const rewardPrice = await utils.getPrices([`${CHAIN}:${rewardToken}`]);

    const tvlUsd =
      (Number(totalStaked) / 1e18) * (lpPrice[`${CHAIN}:${lpToken}`]?.price || 0);

    // Calculate APR
    const yearlyRewards =
      (Number(rewardPerSecond) / 1e18) * 365 * 24 * 60 * 60;
    const yearlyRewardUsd =
      yearlyRewards * (rewardPrice[`${CHAIN}:${rewardToken}`]?.price || 0);

    const apy = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;

    pools.push({
      pool: farm.toLowerCase(),
      chain: formatChain(CHAIN),
      project: 'qom-x',
      symbol: 'LP', // will improve later if needed
      tvlUsd: tvlUsd,
      apy: apy,
      apyReward: apy,
      rewardTokens: [rewardToken],
      underlyingTokens: [lpToken],
      url: 'https://dex.qomx.io/farm',
    });
  }

  return pools.filter((p) => p.tvlUsd > 0);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
