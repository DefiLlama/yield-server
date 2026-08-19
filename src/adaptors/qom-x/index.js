const sdk = require('@defillama/sdk');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

// Same hidden test farms you filter in your frontend
const HIDDEN_FARMS = [
  '0xde89057c4a2448d873971755cf115cabaa475411',
  '0xed57001d377b78d8aa29d3b44ee2b2254ddab45f',
  '0xd70b5ad20cfd7b35967c2171d869319f7b008175',
  '0xa71a2e3d5ad1f0a835fc0b295509e0a56ed044ba',
  '0xc32665de5c16e9bf80b65432f32e99aca3f72ba1',
  '0xd294b6872463dc0539fed80b4a52f1b73c3c20f3',
  '0x75046c72b97869deab0ba9324a1655259cc3567e',
].map((a) => a.toLowerCase());

async function apy() {
  // 1. Get all farms from factory (BSC only)
  let farms = [];
  try {
    const res = await sdk.api.abi.call({
      target: FARM_FACTORY,
      abi: 'function getAllFarms() view returns (address[])',
      chain: CHAIN,
    });
    farms = (res.output || []).filter(
      (addr) => !HIDDEN_FARMS.includes(addr.toLowerCase())
    );
  } catch (e) {
    console.log('getAllFarms failed:', e.message);
    return makePlaceholder();
  }

  console.log(`Found ${farms.length} active farms on BSC`);

  if (!farms.length) return makePlaceholder();

  const pools = [];

  for (const farm of farms) {
    try {
      // Parallel reads – all forced to BSC
      const [
        lpTokenRes,
        rewardTokenRes,
        totalStakedRes,
        rewardPerSecondRes,
        endTimeRes,
        rewardDecimalsRes,
      ] = await Promise.all([
        sdk.api.abi.call({ target: farm, abi: 'address:lpToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'address:rewardToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:totalStaked', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:endTime', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint8:rewardDecimals', chain: CHAIN }).catch(() => ({ output: 18 })),
      ]);

      const lpToken = lpTokenRes.output;
      const rewardToken = rewardTokenRes.output;
      const totalStaked = BigInt(totalStakedRes.output);
      const rewardPerSecond = BigInt(rewardPerSecondRes.output);
      const endTime = Number(endTimeRes.output);
      const rewardDecimals = Number(rewardDecimalsRes.output || 18);

      // Skip finished or empty farms
      if (Date.now() / 1000 > endTime) continue;
      if (totalStaked === 0n) continue;

      // Prices
      const { pricesByAddress } = await utils.getPrices(
        [lpToken, rewardToken],
        CHAIN
      );

      const lpPrice = pricesByAddress[lpToken.toLowerCase()] || 0;
      const rewardPrice = pricesByAddress[rewardToken.toLowerCase()] || 0;

      // TVL
      const tvlUsd = (Number(totalStaked) / 1e18) * lpPrice;
      if (tvlUsd < 1) continue; // skip dust

      // APR
      const yearlyRewardTokens =
        (Number(rewardPerSecond) / 10 ** rewardDecimals) * SECONDS_PER_YEAR;
      const yearlyRewardUsd = yearlyRewardTokens * rewardPrice;
      const apyReward = tvlUsd > 0 ? (yearlyRewardUsd / tvlUsd) * 100 : 0;

      pools.push({
        pool: farm.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'qom-x',
        symbol: 'LP',
        tvlUsd,
        apy: apyReward,
        apyReward,
        rewardTokens: [rewardToken],
        underlyingTokens: [lpToken],
        url: 'https://dex.qomx.io/farm',
      });
    } catch (err) {
      console.log(`Skipping farm ${farm}:`, err.message);
      continue;
    }
  }

  console.log(`Returning ${pools.length} pools with TVL`);
  return pools.length ? pools : makePlaceholder();
}

function makePlaceholder() {
  // Prevents "Cannot read properties of undefined (reading 'project')"
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

module.exports = {
  protocolId: '8444',
  timetravel: false,
  apy,
  url: 'https://dex.qomx.io/farm',
};
