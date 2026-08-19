const sdk = require('@defillama/sdk');
const utils = require('../utils');

const FARM_FACTORY = '0x951AFf794ffD122e4EA90B8BcFeE722c05f7133D';
const CHAIN = 'bsc';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

async function apy() {
  // 1. Automatically discover all farms
  let farms = [];
  try {
    const res = await sdk.api.abi.call({
      target: FARM_FACTORY,
      abi: 'function getAllFarms() view returns (address[])',
      chain: CHAIN,
    });
    farms = res.output || [];
  } catch (e) {
    console.log('getAllFarms failed:', e.message);
    return makePlaceholder();
  }

  console.log(`Found ${farms.length} farms from factory`);
  if (!farms.length) return makePlaceholder();

  const pools = [];

  for (const farm of farms) {
    try {
      // Read farm data
      const [
        lpTokenRes,
        rewardTokenRes,
        totalStakedRes,
        rewardPerSecondRes,
        endTimeRes,
        startTimeRes,
        rewardDecimalsRes,
      ] = await Promise.all([
        sdk.api.abi.call({ target: farm, abi: 'address:lpToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'address:rewardToken', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:totalStaked', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:rewardPerSecond', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:endTime', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint256:startTime', chain: CHAIN }),
        sdk.api.abi.call({ target: farm, abi: 'uint8:rewardDecimals', chain: CHAIN }).catch(() => ({ output: 18 })),
      ]);

      const lpToken = lpTokenRes.output;
      const rewardToken = rewardTokenRes.output;
      const totalStaked = BigInt(totalStakedRes.output);
      const rewardPerSecond = BigInt(rewardPerSecondRes.output); // already scaled to 1e18
      const endTime = Number(endTimeRes.output);
      const startTime = Number(startTimeRes.output);
      const rewardDecimals = Number(rewardDecimalsRes.output || 18);

      // Skip only truly finished + empty farms
      if (startTime > 0 && Date.now() / 1000 > endTime && totalStaked === 0n) continue;
      if (totalStaked === 0n) continue;

      // ===== Real TVL from reserves (same method as your frontend) =====
      const [token0Res, token1Res, reservesRes, totalSupplyRes] = await Promise.all([
        sdk.api.abi.call({ target: lpToken, abi: 'address:token0', chain: CHAIN }),
        sdk.api.abi.call({ target: lpToken, abi: 'address:token1', chain: CHAIN }),
        sdk.api.abi.call({
          target: lpToken,
          abi: 'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
          chain: CHAIN,
        }),
        sdk.api.abi.call({ target: lpToken, abi: 'uint256:totalSupply', chain: CHAIN }),
      ]);

      const token0 = token0Res.output;
      const token1 = token1Res.output;
      const [reserve0, reserve1] = reservesRes.output;
      const totalSupply = BigInt(totalSupplyRes.output);

      // Get prices of underlyings + reward
      const { pricesByAddress } = await utils.getPrices(
        [token0, token1, rewardToken],
        CHAIN
      );

      const price0 = pricesByAddress[token0.toLowerCase()] || 0;
      const price1 = pricesByAddress[token1.toLowerCase()] || 0;
      const rewardPrice = pricesByAddress[rewardToken.toLowerCase()] || 0;

      // Full pair liquidity
      const reserve0Usd = (Number(reserve0) / 1e18) * price0;
      const reserve1Usd = (Number(reserve1) / 1e18) * price1;
      const pairLiquidityUsd = reserve0Usd + reserve1Usd;

      // Only the staked portion
      let tvlUsd = 0;
      if (totalSupply > 0n && pairLiquidityUsd > 0) {
        const ratio = Number(totalStaked) / Number(totalSupply);
        tvlUsd = ratio * pairLiquidityUsd;
      }

      if (tvlUsd < 1) continue; // safety

      // ===== APR (rewardPerSecond is already 1e18 scaled) =====
      const yearlyRewardTokens = (Number(rewardPerSecond) / 1e18) * SECONDS_PER_YEAR;
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
        underlyingTokens: [token0, token1],
        url: 'https://dex.qomx.io/farm',
      });
    } catch (err) {
      console.log(`Skipping farm ${farm}:`, err.message);
      continue;
    }
  }

  console.log(`Returning ${pools.length} pools`);
  return pools.length ? pools : makePlaceholder();
}

function makePlaceholder() {
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
