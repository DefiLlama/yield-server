const sdk = require('@defillama/sdk');
const { formatChain } = require('../utils');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';

const apy = async () => {
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
      const [lpToken, rewardToken, totalStaked, rewardPerSecond, endTime] = await Promise.all([
        sdk.api.abi.call({ target: farm, abi: 'address:lpToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'address:rewardToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:totalStaked', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:endTime', chain: CHAIN }),
      ]);

      if (Date.now() / 1000 > Number(endTime.output)) continue;
      if (Number(totalStaked.output) === 0) continue;

      // Get prices
      const priceKeys = [`${CHAIN}:${lpToken.output}`, `${CHAIN}:${rewardToken.output}`];
      const prices = await utils.getPrices(priceKeys);

      const lpPrice = prices[priceKeys[0].toLowerCase()]?.price || 0;
      const rewardPrice = prices[priceKeys[1].toLowerCase()]?.price || 0;

      const tvlUsd = (Number(totalStaked.output) / 1e18) * lpPrice;
      const yearlyRewards = (Number(rewardPerSecond.output) / 1e18) * 31536000;
      const yearlyRewardUsd = yearlyRewards * rewardPrice;
      const apyValue = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;

      if (tvlUsd < 10) continue;

      pools.push({
        pool: farm.toLowerCase(),
        chain: formatChain(CHAIN),
        project: 'qom-x',
        symbol: 'LP',
        tvlUsd,
        apy: apyValue,
        apyReward: apyValue,
        rewardTokens: [rewardToken.output],
        underlyingTokens: [lpToken.output],
        url: 'https://dex.qomx.io/farm',
      });
    } catch (e) {
      continue;
    }
  }

  return pools;
};

module.exports = {
  protocolId: '8444',
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
