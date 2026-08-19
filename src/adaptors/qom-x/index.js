const sdk = require('@defillama/sdk');
const { formatChain } = require('../utils');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';

async function apy() {
  try {
    // Get all farms
    const farms = (
      await sdk.api.abi.call({
        target: FARM_FACTORY,
        abi: 'function getAllFarms() view returns (address[])',
        chain: CHAIN,
      })
    ).output;

    if (!farms || farms.length === 0) return [];

    const pools = [];

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
        const totalStaked = Number(totalStakedRes.output);
        const rewardPerSecond = Number(rewardPerSecondRes.output);
        const endTime = Number(endTimeRes.output);

        // Skip finished farms
        if (Date.now() / 1000 > endTime) continue;
        if (totalStaked === 0) continue;

        // Get prices
        const prices = await utils.getPrices([
          `${CHAIN}:${lpToken}`,
          `${CHAIN}:${rewardToken}`,
        ]);

        const lpPrice = prices[`${CHAIN}:${lpToken.toLowerCase()}`]?.price || 0;
        const rewardPrice = prices[`${CHAIN}:${rewardToken.toLowerCase()}`]?.price || 0;

        // Calculate TVL in USD
        const tvlUsd = (totalStaked / 1e18) * lpPrice;

        // Calculate yearly rewards in USD
        const yearlyRewardTokens = (rewardPerSecond / 1e18) * 365 * 24 * 60 * 60;
        const yearlyRewardUsd = yearlyRewardTokens * rewardPrice;

        // Calculate APR
        const apy = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;

        pools.push({
          pool: farm.toLowerCase(),
          chain: formatChain(CHAIN),
          project: 'qom-x',
          symbol: 'LP',
          tvlUsd: tvlUsd,
          apy: apy,
          apyReward: apy,
          rewardTokens: [rewardToken],
          underlyingTokens: [lpToken],
          url: 'https://dex.qomx.io/farm',
        });
      } catch (err) {
        // skip any broken farm
        continue;
      }
    }

    return pools.filter((p) => p.tvlUsd > 10); // only show farms with meaningful TVL
  } catch (e) {
    console.log('Qom X yields adapter error:', e.message);
    return [];
  }
}

module.exports = {
  protocolId: '8444',
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
