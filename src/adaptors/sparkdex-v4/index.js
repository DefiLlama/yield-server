const axios = require('axios');
const { aprToApy, keepFinite } = require('../utils');

const V4_POOLS_API =
  'https://api.sparkdex.ai/dex/v4/pools?chainId=14&dex=SparkDEX';
const CHAIN = 'flare';

// aprs[].type from API
const AprTypeId = {
  FEE: 0,
  RFLR: 1,
  DINERO: 2,
  PICO: 3,
  BUGO: 4,
  SPRK: 5,
  DELEGATION: 6,
  CUSDX: 7,
};

// Documented reward types (2–7) that contribute to apyReward; excludes FEE and RFLR
const REWARD_TYPE_IDS = [
  AprTypeId.DINERO,
  AprTypeId.PICO,
  AprTypeId.BUGO,
  AprTypeId.SPRK,
  AprTypeId.DELEGATION,
  AprTypeId.CUSDX,
];

// rFLR can be swapped with 50% penalty instantly to wFLR or linear 12 months 
// So we count APY with ratio: month 1 at 100%, months 2–12 at 50%
// Effective ratio = (1*1 + 11*0.5) / 12 = 13/24
const RFLR_APY_RATIO = (1 * 1 + 11 * 0.5) / 12;

// Reward token address by AprTypeId (RFLR and types 2–7)
const REWARD_TYPE_TO_TOKEN = {
  [AprTypeId.RFLR]: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e',
  [AprTypeId.SPRK]: '0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0',
  [AprTypeId.CUSDX]: '0xFE2907DFa8DB6e320cDbF45f0aa888F6135ec4f8',
  [AprTypeId.DINERO]: '0xBE6D2BE4e01D4304a28eDD13038311e112313ec8',
  [AprTypeId.PICO]: '0x5Ef135F575d215AE5A09E7B30885E866db138aF6',
  [AprTypeId.BUGO]: '0x6c1490729ce19E809Cf9F7e3e223c0490833DE02',
  [AprTypeId.DELEGATION]: '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d', // WFLR
};

const API_TIMEOUT_MS = 5000;

const apy = async () => {
  const response = await axios.get(V4_POOLS_API, {
    timeout: API_TIMEOUT_MS,
  });
  // V4 API returns [{ chain: 14, data: [ pool1, pool2, ... ] }]
  const chainData = Array.isArray(response.data) ? response.data[0] : null;
  if (!chainData || !chainData.data) return [];

  const pools = chainData.data.filter(
    (item) => item.token0 && item.token1
  );

  const result = pools
    .map((lp) => {
      const tvlUsd = lp.tvlUSD;
      if (!tvlUsd || tvlUsd <= 0) return null;

      // Native pool only (no steer/ichi vault comparison)
      const aprs = lp.aprs || [];

      const feeApr = aprs
        .filter((a) => a.type === AprTypeId.FEE)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const rflrApr = aprs
        .filter((a) => a.type === AprTypeId.RFLR)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const otherRewardApr = aprs
        .filter((a) => REWARD_TYPE_IDS.includes(a.type))
        .reduce((s, a) => s + (a.apr || 0), 0);

      const apyBase = aprToApy(feeApr);
      // rFLR can be swapped with 50% penalty instantly to wFLR or linear 12 months 
      // So we count APY with ratio: month 1 at 100%, months 2–12 at 50%
      // Effective ratio = (1*1 + 11*0.5) / 12 = 13/24
      const rflrApy = aprToApy(rflrApr * RFLR_APY_RATIO);
      const otherRewardApy = aprToApy(otherRewardApr);
      const apyReward = otherRewardApy + rflrApy;

      const poolMeta = {
        pool: `${lp.id}-${CHAIN}`.toLowerCase(),
        symbol: `${lp.token0.symbol}-${lp.token1.symbol}`,
        project: 'sparkdex-v4',
        chain: CHAIN,
        tvlUsd,
        apyBase,
        underlyingTokens: [lp.token0.id, lp.token1.id],
      };
      if (apyReward > 0) {
        poolMeta.apyReward = apyReward;
        // Reward tokens from apr types that have non-zero APR
        const rewardTypesWithApr = aprs.filter(
          (a) =>
            a.type in REWARD_TYPE_TO_TOKEN && (a.apr || 0) > 0
        );
        poolMeta.rewardTokens = [
          ...new Set(
            rewardTypesWithApr.map((a) => REWARD_TYPE_TO_TOKEN[a.type])
          ),
        ];
      }
      return poolMeta;
    })
    .filter(Boolean)
    .filter((p) => keepFinite(p));

  return result;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://sparkdex.ai/pool',
};
