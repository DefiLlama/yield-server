const axios = require('axios');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { aprToApy, keepFinite, getBlocksByTime, getPrices } = require('../utils');

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

// rFLR: 12-month linear vesting — 1 month at 100%, 11 months at 50%.
// Effective ratio = (1×100% + 11×50%) / 12 = 13/24 (single source of truth for RFLR APY scaling).
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
// SparkDEX UI has no per-pool deep link; V4 liquidity lives under this shared entry.
const POOL_V4_URL = 'https://sparkdex.ai/pool/v4';

// API `aprs[].apr` values are already in percent form (×100 vs decimal), matching `aprToApy` input.

const apy = async () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const [block] = await getBlocksByTime([timestamp], CHAIN);

  const response = await axios.get(V4_POOLS_API, {
    timeout: API_TIMEOUT_MS,
  });
  const chainData = Array.isArray(response.data) ? response.data[0] : null;
  if (!chainData || !chainData.data) return [];

  const pools = chainData.data.filter(
    (item) => item.token0 && item.token1
  );
  if (pools.length === 0) return [];

  const tokenAddresses = [
    ...new Set(
      pools.flatMap((p) => [p.token0.id, p.token1.id])
    ),
  ];
  const { pricesByAddress } = await getPrices(
    tokenAddresses.map((a) => a.toLowerCase()),
    CHAIN
  );

  // Single batched multiCall for all pool balances (TVL from chain).
  const balanceCalls = pools.flatMap((p) => [
    { target: p.token0.id, params: [p.id] },
    { target: p.token1.id, params: [p.id] },
  ]);
  const balanceRes = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: balanceCalls,
    chain: CHAIN,
    block,
    permitFailure: true,
  });

  const result = pools
    .map((lp, i) => {
      const out = balanceRes.output;
      const balance0 = BigNumber(out[2 * i].output || 0);
      const balance1 = BigNumber(out[2 * i + 1].output || 0);
      const token0 = lp.token0.id;
      const token1 = lp.token1.id;
      const price0 = pricesByAddress[token0.toLowerCase()] || 0;
      const price1 = pricesByAddress[token1.toLowerCase()] || 0;
      if (!price0 || !price1) return null;
      const decimals0 = Number(lp.token0.decimals ?? 18);
      const decimals1 = Number(lp.token1.decimals ?? 18);
      const tvl0 = balance0.times(10 ** (18 - decimals0)).times(price0).div(1e18);
      const tvl1 = balance1.times(10 ** (18 - decimals1)).times(price1).div(1e18);
      const tvlUsd = tvl0.plus(tvl1).toNumber();
      if (!tvlUsd || tvlUsd <= 0) return null;

      const aprs = lp.aprs || [];
      const feeApr = aprs
        .filter((a) => a.type === AprTypeId.FEE)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const apyBase = feeApr > 0 ? aprToApy(feeApr) : 0;
      const rflrApr = aprs
        .filter((a) => a.type === AprTypeId.RFLR)
        .reduce((s, a) => s + (a.apr || 0), 0);
      const otherRewardApr = aprs
        .filter((a) => REWARD_TYPE_IDS.includes(a.type))
        .reduce((s, a) => s + (a.apr || 0), 0);
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
        url: POOL_V4_URL,
      };
      if (apyReward > 0) {
        poolMeta.apyReward = apyReward;
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
  url: POOL_V4_URL,
};
