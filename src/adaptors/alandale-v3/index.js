const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'alandale-v3';
const CHAIN = 'robinhood';
const URL = 'https://app.alandale.xyz';
const SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cms6oy9216bwr01wahoyxhk79/subgraphs/alandale-cl-mainnet/1.0.0/gn';

const VOTER = '0x4cF1c47B95031cD2bb1d102021D8Ede60392971C';
const MINTER = '0x782355E7771A9Aa0834de4Ae981DCF3b7aeC11e6';
const LUTE = '0xD1e861CC5Eee7eA88649206b74504D78CCD7AEeA';

// Algebra Constants.sol: swap fees are in millionths, the community fee in thousandths.
const FEE_DENOMINATOR = 1e6;
const COMMUNITY_FEE_DENOMINATOR = 1e3;

const HOUR = 3600;
const EPOCH = 604800;
const EPOCHS_PER_YEAR = 52;
const ZERO = '0x0000000000000000000000000000000000000000';

const poolsQuery = gql`
  {
    pools(first: 1000) {
      id
      fee
      totalValueLockedToken0
      totalValueLockedToken1
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
    }
  }
`;

const hourlyQuery = gql`
  query Hourly($since: Int!, $until: Int!) {
    poolHourDatas(
      first: 1000
      where: { periodStartUnix_gte: $since, periodStartUnix_lt: $until }
      orderBy: periodStartUnix
      orderDirection: desc
    ) {
      pool {
        id
      }
      volumeToken0
      volumeToken1
    }
  }
`;

const apy = async () => {
  // Bound the window to whole hourly buckets so the result does not drift with the
  // minute the adaptor happens to run at.
  const until = Math.floor(Date.now() / 1000 / HOUR) * HOUR;
  const since = until - 86400;
  const [{ pools }, { poolHourDatas }] = await Promise.all([
    request(SUBGRAPH, poolsQuery),
    request(SUBGRAPH, hourlyQuery, { since, until }),
  ]);

  const volume = {};
  poolHourDatas.forEach((h) => {
    const id = h.pool.id.toLowerCase();
    const cur = volume[id] ?? { token0: 0, token1: 0 };
    cur.token0 += Number(h.volumeToken0) || 0;
    cur.token1 += Number(h.volumeToken1) || 0;
    volume[id] = cur;
  });

  const addresses = [
    ...new Set(pools.flatMap((p) => [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()])),
  ];

  // Whatever share of the swap fee a pool routes to its community fee leaves the pool
  // for veLUTE voters, so only the remainder ever reaches liquidity providers.
  const [
    { pricesByAddress },
    globalStates,
    gauges,
    activePeriod,
    weeklyRaw,
    teamRateRaw,
    precisionRaw,
  ] = await Promise.all([
      utils.getPrices([...addresses, LUTE], CHAIN),
      sdk.api2.abi.multiCall({
        abi: 'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
        calls: pools.map((p) => p.id),
        chain: CHAIN,
        permitFailure: true,
      }),
      sdk.api2.abi.multiCall({
        target: VOTER,
        abi: 'function poolToGauge(address) view returns (address)',
        calls: pools.map((p) => p.id),
        chain: CHAIN,
        permitFailure: true,
      }),
      sdk.api2.abi.call({ target: MINTER, abi: 'uint256:active_period', chain: CHAIN }),
      sdk.api2.abi.call({ target: MINTER, abi: 'uint256:weekly', chain: CHAIN }),
      sdk.api2.abi.call({ target: MINTER, abi: 'uint256:teamRate', chain: CHAIN }),
      sdk.api2.abi.call({ target: MINTER, abi: 'uint256:PRECISION', chain: CHAIN }),
    ]);

  // The team takes its cut of the weekly mint before anything reaches a gauge.
  const precision = Number(precisionRaw) || 1;
  const weeklyLute = (Number(weeklyRaw) / 1e18) * (1 - Number(teamRateRaw) / precision);

  // A week's emissions are split on the votes of the epoch that funded it, which is
  // the one that just closed; the running epoch decides the week after.
  const epoch =
    BigInt(String(activePeriod)) - (BigInt(String(activePeriod)) % BigInt(EPOCH));
  const readTotalWeight = (e) =>
    sdk.api2.abi.call({
      target: VOTER,
      abi: 'function totalWeightsPerEpoch(uint256) view returns (uint256)',
      params: [e.toString()],
      chain: CHAIN,
    });
  const [fundedRaw, runningRaw] = await Promise.all([
    readTotalWeight(epoch - BigInt(EPOCH)),
    readTotalWeight(epoch),
  ]);
  const funded = Number(fundedRaw) / 1e18;
  const voteEpoch = funded > 0 ? epoch - BigInt(EPOCH) : epoch;
  const totalWeight = funded > 0 ? funded : Number(runningRaw) / 1e18;

  const poolWeights = await sdk.api2.abi.multiCall({
    target: VOTER,
    abi: 'function weightsPerEpoch(uint256, address) view returns (uint256)',
    calls: pools.map((p) => ({ params: [voteEpoch.toString(), p.id] })),
    chain: CHAIN,
    permitFailure: true,
  });

  // An unavailable read must stay unavailable: collapsing it to 0 would publish a
  // verified no-reward pool, which downstream cannot tell apart from a real zero.
  const lutePerYearFor = (gauge, weightRaw) => {
    if (gauge == null) return null;
    if (gauge === ZERO) return 0;
    if (weightRaw == null) return null;
    if (!(totalWeight > 0)) return 0;
    return (Number(weightRaw) / 1e18 / totalWeight) * weeklyLute * EPOCHS_PER_YEAR;
  };

  const lpShare = {};
  const feeRate = {};
  const emissions = {};
  pools.forEach((p, i) => {
    const id = p.id.toLowerCase();
    // A failed read must not fall back to "no community fee", which would credit
    // liquidity providers with fees they do not receive.
    const communityFee = Number(
      globalStates[i]?.communityFee ?? COMMUNITY_FEE_DENOMINATOR
    );
    lpShare[id] = 1 - communityFee / COMMUNITY_FEE_DENOMINATOR;
    // lastFee is the fee actually charged, unlike the subgraph's stored tier.
    const lastFee = Number(globalStates[i]?.lastFee ?? 0);
    feeRate[id] = lastFee > 0 ? lastFee / FEE_DENOMINATOR : Number(p.fee) / FEE_DENOMINATOR;
    emissions[id] = lutePerYearFor(gauges[i], poolWeights[i]);
  });
  const lutePrice = pricesByAddress[LUTE.toLowerCase()] ?? 0;

  return pools
    .map((p) => {
      const t0 = p.token0.id.toLowerCase();
      const t1 = p.token1.id.toLowerCase();
      const price0 = pricesByAddress[t0];
      const price1 = pricesByAddress[t1];
      if (price0 === undefined || price1 === undefined) return null;

      const tvlUsd =
        Number(p.totalValueLockedToken0) * price0 +
        Number(p.totalValueLockedToken1) * price1;
      if (!(tvlUsd > 0)) return null;

      const id = p.id.toLowerCase();
      const vol = volume[id] ?? { token0: 0, token1: 0 };
      // Both legs describe the same trade, so volume is their average, not the sum.
      const volumeUsd = (vol.token0 * price0 + vol.token1 * price1) / 2;
      const feeTier = feeRate[id] ?? 0;
      const lpFeeShare = lpShare[id] ?? 0;
      const apyBase = ((volumeUsd * feeTier * lpFeeShare * 365) / tvlUsd) * 100;

      // Emissions that exist but cannot be priced are unknown, not zero.
      const lutePerYear = emissions[id];
      let apyReward = null;
      if (lutePerYear === 0) apyReward = 0;
      else if (lutePerYear > 0 && lutePrice > 0)
        apyReward = ((lutePerYear * lutePrice) / tvlUsd) * 100;

      return {
        pool: `${p.id}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${p.token0.symbol}-${p.token1.symbol}`,
        tvlUsd,
        apyBase: Number.isFinite(apyBase) ? apyBase : 0,
        apyReward: Number.isFinite(apyReward) ? apyReward : null,
        rewardTokens: [LUTE],
        underlyingTokens: [p.token0.id, p.token1.id],
        // Concentrated-liquidity positions are NFTs, not a fungible pool token.
        token: null,
        url: `${URL}/pools/${p.id}`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8400',
  timetravel: false,
  apy,
  url: `${URL}/pools`,
};
