const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'hyperswap-v2';
const CHAIN = 'hyperevm';
const MIN_TVL_USD = 1000;
const FEE_RATE = 0.003;
// factory.feeInfo() is (ownerFeeShare, feeTo). _mintFee sends the protocol
// ownerFeeShare/1e5 of the fee growth. 40000 today, so LPs keep 0.18% of 0.3%.
const FACTORY = '0x724412C00059bf7d6ee7d4a1d0D5cd4de3ea1C48';
const FEE_SHARE_DENOM = 1e5;
const SUBGRAPH_URL =
  'https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v2/v1.0.0/gn';

const pairsQuery = gql`
  query getPairs(
    $first: Int!
    $skip: Int!
    $minTvl: BigDecimal!
    $hourCutoff: Int!
  ) {
    pairs(
      first: $first
      skip: $skip
      orderBy: reserveUSD
      orderDirection: desc
      where: { reserveUSD_gt: $minTvl }
    ) {
      id
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      reserveUSD
      pairHourData(
        first: 24
        orderBy: hourStartUnix
        orderDirection: desc
        where: { hourStartUnix_gt: $hourCutoff }
      ) {
        hourlyVolumeUSD
      }
    }
  }
`;

async function fetchAllPairs() {
  const all = [];
  const first = 1000;
  let skip = 0;
  const hourCutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
  while (true) {
    const { pairs } = await request(SUBGRAPH_URL, pairsQuery, {
      first,
      skip,
      minTvl: String(MIN_TVL_USD),
      hourCutoff,
    });
    if (!pairs?.length) break;
    all.push(...pairs);
    if (pairs.length < first) break;
    skip += first;
  }
  return all;
}

// Pair entity has no derived `pairDayData` field, so we fetch the global
// PairDayData stream filtered by date and group by pairAddress in JS.
const dayDataQuery = gql`
  query getPairDayData($first: Int!, $skip: Int!, $dateCutoff: Int!) {
    pairDayDatas(
      first: $first
      skip: $skip
      orderBy: date
      orderDirection: desc
      where: { date_gt: $dateCutoff }
    ) {
      pairAddress
      date
      dailyVolumeUSD
    }
  }
`;

async function fetchPairDayVolumes() {
  const dateCutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  const first = 1000;
  let skip = 0;
  const byPair = new Map();
  while (true) {
    const { pairDayDatas } = await request(SUBGRAPH_URL, dayDataQuery, {
      first,
      skip,
      dateCutoff,
    });
    if (!pairDayDatas?.length) break;
    for (const d of pairDayDatas) {
      const key = d.pairAddress.toLowerCase();
      const arr = byPair.get(key) || [];
      arr.push(Number(d.dailyVolumeUSD) || 0);
      byPair.set(key, arr);
    }
    if (pairDayDatas.length < first) break;
    skip += first;
  }
  return byPair;
}

// Throws when feeInfo can't be read, rather than crediting LPs with the gross fee.
async function getLpFeeShare() {
  const { output } = await sdk.api.abi.call({
    target: FACTORY,
    abi: 'function feeInfo() view returns (uint256 ownerFeeShare, address feeTo)',
    chain: 'hyperliquid',
  });
  const raw = Array.isArray(output) ? output[0] : output?.ownerFeeShare;
  const ownerFeeShare = Number(raw);
  if (!Number.isFinite(ownerFeeShare) || ownerFeeShare < 0 || ownerFeeShare > FEE_SHARE_DENOM) {
    throw new Error('hyperswap-v2: bad ownerFeeShare');
  }
  return 1 - ownerFeeShare / FEE_SHARE_DENOM;
}

async function apy() {
  const [pairs, dayVolumesByPair, lpFeeShare] = await Promise.all([
    fetchAllPairs(),
    fetchPairDayVolumes(),
    getLpFeeShare(),
  ]);
  const lpFeeRate = FEE_RATE * lpFeeShare;

  const formatted = pairs.map((p) => {
    const tvlUsd = Number(p.reserveUSD);

    const volumeUsd1d = (p.pairHourData || []).reduce(
      (sum, h) => sum + Number(h.hourlyVolumeUSD || 0),
      0
    );
    const feesUsd1d = volumeUsd1d * lpFeeRate;
    const apyBase = (feesUsd1d * 365) / tvlUsd * 100;

    const dailyVols = dayVolumesByPair.get(p.id) || [];
    const volumeUsd7d = dailyVols.reduce((s, v) => s + v, 0);
    const fees7d = volumeUsd7d * lpFeeRate;
    // PairDayData omits days with no swaps, so divide by the 7-day window.
    const apyBase7d = dailyVols.length
      ? (fees7d * 365) / 7 / tvlUsd * 100
      : NaN;

    const token0 = p.token0.id;
    const token1 = p.token1.id;
    const feePct = FEE_RATE * 100;

    return {
      pool: p.id,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: `${p.token0.symbol}-${p.token1.symbol}`,
      tvlUsd,
      apyBase,
      apyBase7d,
      underlyingTokens: [token0, token1],
      poolMeta: `${feePct}%`,
      url: `https://app.hyperswap.exchange/liquidity/add/v2?tokenA=${token0}&tokenB=${token1}`,
      volumeUsd1d,
      volumeUsd7d,
    };
  });

  const withRewards = await addMerklRewardApy(formatted, 'hyperswap');
  return withRewards.filter((p) => utils.keepFinite(p));
}

module.exports = {
  protocolId: '5836',
  timetravel: false,
  apy,
  url: 'https://app.hyperswap.exchange',
};
