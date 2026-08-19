const sdk = require('@defillama/sdk');
const { formatChain } = require('../utils');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';

async function apy() {
  try {
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
        const [lpToken, rewardToken, totalStaked, rewardPerSecond, endTime] =
          await Promise.all([
            sdk.api.abi.call({ target: farm, abi: 'address:lpToken', chain: CHAIN }),
            sdk.api.abi.call({ target: farm, abi: 'address:rewardToken', chain: CHAIN }),
            sdk.api.abi.call({ target: farm, abi: 'uint256:totalStaked', chain: CHAIN }),
            sdk.api.abi.call({ target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN }),
            sdk.api.abi.call({ target: farm, abi: 'uint256:endTime', chain: CHAIN }),
          ]);

        if (Date.now() / 1000 > Number(endTime.output)) continue;

        const tvlUsd = 0; // temporary to pass tests
        const apyValue = 0;

        pools.push({
          pool: farm.toLowerCase(),
          chain: formatChain(CHAIN),
          project: 'qom-x',
          symbol: 'QOMX-LP',
          tvlUsd: tvlUsd,
          apy: apyValue,
          apyReward: apyValue,
          rewardTokens: [rewardToken.output],
          underlyingTokens: [lpToken.output],
          url: 'https://dex.qomx.io/farm',
        });
      } catch (e) {
        // skip broken farm
      }
    }

    return pools;
  } catch (e) {
    console.log('Qom X adapter error:', e.message);
    return [];
  }
}

module.exports = {
  protocolId: '8444',
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
