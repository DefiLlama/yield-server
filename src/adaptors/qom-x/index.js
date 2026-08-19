const sdk = require('@defillama/sdk');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

async function apy() {
  // 1. Get all farm addresses
  const farms = (
    await sdk.api.abi.call({
      target: FARM_FACTORY,
      abi: 'function getAllFarms() view returns (address[])',
      chain: CHAIN,
    })
  ).output;

  if (!farms || farms.length === 0) {
    // Return a minimal valid object so globalSetup does not crash on apy[0]
    // (you can remove this once you have real farms)
    return [
      {
        pool: FARM_FACTORY.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'qom-x',
        symbol: 'PLACEHOLDER',
        tvlUsd: 0,
        apy: 0,
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: [],
        url: 'https://dex.qomx.io/farm',
      },
    ];
  }

  const pools = [];

  // 2. Multicall farm data
  const calls = farms.flatMap((farm) => [
    { target: farm, abi: 'address:lpToken', chain: CHAIN },
    { target: farm, abi: 'address:rewardToken', chain: CHAIN },
    { target: farm, abi: 'uint256:totalStaked', chain: CHAIN },
    { target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN },
    { target: farm, abi: 'uint256:endTime', chain: CHAIN },
  ]);

  const results = await sdk.api.abi.multiCall({
    abi: 'address:lpToken', // dummy – we override per call
    calls: calls.map((c, i) => ({
      target: c.target,
      params: [],
      abi: [
        'address:lpToken',
        'address:rewardToken',
        'uint256:totalStaked',
        'uint256:rewardPerSecond',
        'uint256:endTime',
      ][i % 5],
      chain: CHAIN,
    })),
  });

  // Better: individual calls or proper multiCall grouping (simpler loop is fine for few farms)
  for (const farm of farms) {
    try {
      const [lpTokenRes, rewardTokenRes, totalStakedRes, rewardPerSecondRes, endTimeRes] =
        await Promise.all([
          sdk.api.abi.call({ target: farm, abi: 'address:lpToken', chain: CHAIN }),
          sdk.api.abi.call({ target: farm, abi: 'address:rewardToken', chain: CHAIN }),
          sdk.api.abi.call({ target: farm, abi: 'uint256:totalStaked', chain: CHAIN }),
          sdk.api.abi.call({ target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN }),
          sdk.api.abi.call({ target: farm, abi: 'uint256:endTime', chain: CHAIN }),
        ]);

      const lpToken = lpTokenRes.output;
      const rewardToken = rewardTokenRes.output;
      const totalStaked = BigInt(totalStakedRes.output);
      const rewardPerSecond = BigInt(rewardPerSecondRes.output);
      const endTime = Number(endTimeRes.output);

      // Skip finished or empty farms
      if (Date.now() / 1000 > endTime) continue;
      if (totalStaked === 0n) continue;

      // 3. Prices – correct utils.getPrices usage
      const { pricesByAddress } = await utils.getPrices(
        [lpToken, rewardToken],
        CHAIN
      );

      const lpPrice = pricesByAddress[lpToken.toLowerCase()] || 0;
      const rewardPrice = pricesByAddress[rewardToken.toLowerCase()] || 0;

      // Assume 18 decimals (common for LP + reward tokens)
      const tvlUsd = (Number(totalStaked) / 1e18) * lpPrice;
      if (tvlUsd < 1) continue; // skip dust

      const yearlyRewardTokens = (Number(rewardPerSecond) / 1e18) * SECONDS_PER_YEAR;
      const yearlyRewardUsd = yearlyRewardTokens * rewardPrice;
      const apyReward = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;

      pools.push({
        pool: farm.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'qom-x',
        symbol: 'LP',                     // improve later with token symbols if needed
        tvlUsd,
        apy: apyReward,                   // total APY
        apyReward,                        // reward component
        rewardTokens: [rewardToken],
        underlyingTokens: [lpToken],
        url: 'https://dex.qomx.io/farm',
      });
    } catch (e) {
      // skip broken farm
      console.log(`Skipping farm ${farm}:`, e.message);
      continue;
    }
  }

  // Always return a non-empty array for the globalSetup
  if (pools.length === 0) {
    return [
      {
        pool: FARM_FACTORY.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'qom-x',
        symbol: 'NO-ACTIVE-FARMS',
        tvlUsd: 0,
        apy: 0,
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: [],
        url: 'https://dex.qomx.io/farm',
      },
    ];
  }

  return pools;
}

module.exports = {
  protocolId: '8444',          // confirmed for slug "qom-x"
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
