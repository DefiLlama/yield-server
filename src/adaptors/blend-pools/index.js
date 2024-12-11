const {
  PoolConfig,
  ReserveData,
  BackstopConfig,
  Pool,
  BackstopToken,
  Backstop,
  FixedMath,
} = require('@blend-capital/blend-sdk');
const { getPrices, keepFinite, formatChain } = require('../utils');

const BACKSTOP_ID = 'CAO3AGAMZVRMHITL36EJ2VZQWKYRPWMQAPDQD5YEOF3GIF7T44U4JAL3';
const BLND_ID = 'CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY';
const network = {
  rpc: 'https://soroban-rpc.creit.tech/',
  passphrase: 'Public Global Stellar Network ; September 2015',
};

const getApy = async (poolId, backstop) => {
  const pool = await Pool.load(network, poolId);
  // Skip pools that have been admin frozen - Pool is very likely to be broken
  if (pool.config.status === 4) return [];
  const prices = await getPrices(pool.config.reserveList, 'stellar');
  let pools = [];
  for (const reserve of pool.reserves.values()) {
    const price = prices.pricesByAddress[reserve.assetId.toLowerCase()];
    if (price) {
      let supplyEmissionsPerAsset = reserve.emissionsPerYearPerSuppliedAsset();
      let borrowEmissionsPerAsset = reserve.emissionsPerYearPerBorrowedAsset();
      let supplyEmissionsAPR = undefined;
      let borrowEmissionsAPR = undefined;
      // The backstop token is an 80/20 weighted lp token of blnd and usdc respectively
      // (Calculated using balancer spot equation)
      // @TODO replace with coingecko price after listing
      const usdcPerBlnd =
        FixedMath.toFloat(backstop.backstopToken.usdc, 7) /
        0.2 /
        (FixedMath.toFloat(backstop.backstopToken.blnd, 7) / 0.8);
      if (supplyEmissionsPerAsset > 0) {
        supplyEmissionsAPR = (supplyEmissionsPerAsset * usdcPerBlnd) / price;
      }
      if (borrowEmissionsPerAsset > 0) {
        borrowEmissionsAPR = (borrowEmissionsPerAsset * usdcPerBlnd) / price;
      }
      // Estimate borrow APY compoumded daily
      const borrowApy = (1 + reserve.borrowApr / 365) ** 365 - 1;
      let totalSupply = reserve.totalSupplyFloat() * price;
      let totalBorrow = reserve.totalLiabilitiesFloat() * price;

      const url = `https://mainnet.blend.capital/dashboard/?poolId=${poolId}`;

      pools.push({
        pool: `${poolId}-${reserve.assetId}-stellar`.toLowerCase(),
        chain: formatChain('stellar'),
        project: 'blend-pools',
        symbol: reserve.tokenMetadata.symbol,
        tvlUsd: totalSupply - totalBorrow,
        // Supply is kept as APR to prevent overestimation of APY
        apyBase: reserve.supplyApr * 100,
        apyReward: supplyEmissionsAPR * 100,
        underlyingTokens: [reserve.assetId],
        rewardTokens: borrowEmissionsAPR || supplyEmissionsAPR ? [BLND_ID] : [],
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        apyBaseBorrow: borrowApy * 100,
        apyRewardBorrow: borrowEmissionsAPR * 100,
        ltv: totalBorrow / totalSupply,
        url,
      });
    }
  }
  return pools;
};

const apy = async () => {
  let backstop = await Backstop.load(network, BACKSTOP_ID);
  const pools = await Promise.allSettled(
    backstop.config.rewardZone.map(async (poolId) => getApy(poolId, backstop))
  );
  return pools
    .filter((i) => i.status === 'fulfilled' && i.value !== undefined)
    .map((i) => i.value)
    .flat()
    .filter((p) => p !== undefined && keepFinite(p));
};

module.exports = {
  apy,
};
