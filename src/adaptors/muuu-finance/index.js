const sdk = require('@defillama/sdk');
const BigNumberJs = require('bignumber.js');
const ABI = require('./abi.json');
const utils = require('../utils');
const {
  getExtraRewardInfos,
  getExtraRewardTokenStaticDatas,
  getKaglaInfo,
  getMarketPrices,
  getPoolInfo,
  getRewardPools,
  getMuuuToken,
  findKaglaPoolFromPoolInfo,
  attachSymbolToCoinAddresses,
  convertLpTokenPriceToUsd,
  calcurateMuuuEarned,
  convertAPR2APY,
  KGL_TOKEN,
  MUUU_TOKEN,
  LAY_TOKEN,
  WASTR_TOKEN,
  BN_ZERO,
} = require('./functions');
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const getApy = async (param) => {
  const poolInfo = await getPoolInfo();
  const { kaglaPools, kaglaCoins } = await getKaglaInfo();
  const rawMarketPrices = await getMarketPrices();
  const rewardPools = await getRewardPools(poolInfo);

  const kglPrice = rawMarketPrices[KGL_TOKEN];
  const muuuPrice = rawMarketPrices[MUUU_TOKEN];
  const astrPrice = rawMarketPrices[WASTR_TOKEN];
  const layPrice = rawMarketPrices[LAY_TOKEN];

  return poolInfo
    .map((v, _idx) => {
      const finded = findKaglaPoolFromPoolInfo(v.gauge, kaglaPools);
      if (finded == null) return null;
      const { pool: kaglaPool, gauge } = finded;

      const poolCoins = attachSymbolToCoinAddresses(
        kaglaPool.coins,
        kaglaCoins
      );
      if (poolCoins == null) return null;
      const lpTokenUSDPrice = convertLpTokenPriceToUsd(
        kaglaPool.assetType,
        kaglaPool.lpToken.virtualPrice,
        { astr: astrPrice, kgl: kglPrice, lay: layPrice }
      );
      if (lpTokenUSDPrice == null) return null;

      const rewardPool = rewardPools[v.kglRewards.toLowerCase()];
      if (rewardPool == undefined) return null;

      const tvl = rewardPool.totalSupply.multipliedBy(lpTokenUSDPrice);

      return {
        pool: v.token,
        chain: 'astar',
        project: 'muuu-finance',
        symbol: poolCoins.map((coin) => coin.symbol).join('-'),
        tvlUsd: tvl.toNumber(),
        apyBase: convertAPR2APY(gauge.minAPR) * 100,
        apyReward: convertAPR2APY(gauge.minAPR) * 100,
        underlyingTokens: kaglaPool.coins.map((coin) => coin.address),
        rewardTokens: [v.kglRewards],
      };
    })
    .filter((v) => v != null);
};

module.exports = {
  apy: getApy,
  url: 'https://muuu.finance/app/stake',
};
