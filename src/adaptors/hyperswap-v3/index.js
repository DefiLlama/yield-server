const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'hyperswap-v3';
const CHAIN = 'hyperevm';
const SDK_CHAIN = 'hyperliquid';
const MIN_TVL_USD = 10000;
const SUBGRAPH_URL =
  'https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v3/v0.1.2/gn';

const poolsQuery = gql`
  query getPools($first: Int!, $skip: Int!, $minTvl: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minTvl }
    ) {
      id
      token0 { id symbol decimals }
      token1 { id symbol decimals }
      feeTier
      totalValueLockedUSD
      poolDayData(first: 7, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
      }
    }
  }
`;

async function fetchAllPools() {
  const all = [];
  const first = 1000;
  let skip = 0;
  while (true) {
    const { pools } = await request(SUBGRAPH_URL, poolsQuery, {
      first,
      skip,
      minTvl: String(MIN_TVL_USD),
    });
    if (!pools?.length) break;
    all.push(...pools);
    if (pools.length < first) break;
    skip += first;
  }
  return all;
}

// with the fee switch on, the pool sends 1/feeProtocol of each swap fee to the
// protocol, so lps only earn the rest. token0's cut is the low nibble, token1's
// the high one; take the larger, as uniswap-v3 does
const getLpFeeShares = async (poolIds) => {
  const { output } = await sdk.api.abi.multiCall({
    abi: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    calls: poolIds.map((target) => ({ target })),
    chain: SDK_CHAIN,
  });
  const share = (n) => (n ? 1 / n : 0);
  return output.map(({ output: slot0 }) => {
    const feeProtocol = Number(slot0.feeProtocol);
    return 1 - Math.max(share(feeProtocol & 0xf), share(feeProtocol >> 4));
  });
};

async function apy() {
  const pools = await fetchAllPools();

  const formatted = pools
    .map((p) => {
      const days = p.poolDayData || [];
      const day = days[0];
      const tvlUsd = Number(day?.tvlUSD) || Number(p.totalValueLockedUSD);
      if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) return null;

      // No fees data point → leave apyBase NaN so utils.keepFinite drops it
      // (unless Merkl rewards make it finite).
      const feesUsd = Number(day?.feesUSD);
      const apyBase = Number.isFinite(feesUsd)
        ? (feesUsd * 365) / tvlUsd * 100
        : NaN;

      const fees7d = days.reduce((s, d) => s + (Number(d.feesUSD) || 0), 0);
      const volume7d = days.reduce((s, d) => s + (Number(d.volumeUSD) || 0), 0);
      const apyBase7d = days.length
        ? ((fees7d / days.length) * 365) / tvlUsd * 100
        : NaN;

      const feePercent = Number(p.feeTier) / 10000;
      const token0 = p.token0.id;
      const token1 = p.token1.id;

      return {
        pool: p.id,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${p.token0.symbol}-${p.token1.symbol}`,
        tvlUsd,
        apyBase,
        apyBase7d,
        underlyingTokens: [token0, token1],
        poolMeta: `${feePercent}%`,
        url: `https://app.hyperswap.exchange/liquidity/add/v3?tokenA=${token0}&tokenB=${token1}&fee=${p.feeTier}`,
        volumeUsd1d: Number(day?.volumeUSD) || 0,
        volumeUsd7d: volume7d,
      };
    })
    .filter(Boolean);

  // the subgraph's feesUSD is volume x fee tier, before the protocol cut
  const lpFeeShares = await getLpFeeShares(formatted.map((p) => p.pool));
  formatted.forEach((p, i) => {
    p.apyBase *= lpFeeShares[i];
    p.apyBase7d *= lpFeeShares[i];
  });

  const withRewards = await addMerklRewardApy(formatted, 'hyperswap');
  return withRewards.filter((p) => utils.keepFinite(p));
}

module.exports = {
  protocolId: '5837',
  timetravel: false,
  apy,
  url: 'https://app.hyperswap.exchange',
};
