const utils = require('../utils');

const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const { facadeAbi } = require('./abi');

const chains = [
  {
    chainName: 'base',
    facade: '0xeb2071e9b542555e90e6e4e1f83fa17423583991',
    graph:
      'https://api.goldsky.com/api/public/project_cmgzim3e100095np2gjnbh6ry/subgraphs/dtf-yield-base/4.2.0-v2/gn',
  },
  {
    chainName: 'ethereum',
    facade: '0x2C7ca56342177343A2954C250702Fd464f4d0613',
    graph:
      'https://api.goldsky.com/api/public/project_cmgzim3e100095np2gjnbh6ry/subgraphs/dtf-yield-mainnet/4.2.0-v2/gn',
  },
  {
    chainName: 'arbitrum',
    facade: '0x387A0C36681A22F728ab54426356F4CAa6bB48a9',
    graph:
      'https://api.goldsky.com/api/public/project_cmgzim3e100095np2gjnbh6ry/subgraphs/reserve-arbitrum/prod/gn',
  },
];

const rtokenQuery = gql`
  {
    rtokens(orderBy: cumulativeUniqueUsers, orderDirection: desc) {
      id
      cumulativeUniqueUsers
      targetUnits
      rsrStaked
      token {
        name
        symbol
        lastPriceUSD
        holderCount
        transferCount
        totalSupply
        cumulativeVolume
      }
    }
  }
`;

const rtokenTvl = (rtoken) =>
  (rtoken.token?.totalSupply / 1e18) * rtoken.token?.lastPriceUSD || 0;

const buildSnapshotQuery = (rtokens, dayNow) => {
  const fragments = rtokens.flatMap((rtoken, i) => {
    const addr = rtoken.id.toLowerCase();
    return [
      `now_${i}: tokenDailySnapshot(id: "${addr}-${dayNow}") { basketRate }`,
      `now1_${i}: tokenDailySnapshot(id: "${addr}-${dayNow - 1}") { basketRate }`,
      `d7_${i}: tokenDailySnapshot(id: "${addr}-${dayNow - 7}") { basketRate }`,
      `d7b_${i}: tokenDailySnapshot(id: "${addr}-${dayNow - 8}") { basketRate }`,
      `d30_${i}: tokenDailySnapshot(id: "${addr}-${dayNow - 30}") { basketRate }`,
      `d30b_${i}: tokenDailySnapshot(id: "${addr}-${dayNow - 31}") { basketRate }`,
    ];
  });
  return gql`{ ${fragments.join('\n')} }`;
};

const apyChain = async ({ chainName, facade, graph }) => {
  const { rtokens } = await request(graph, rtokenQuery);

  const filtered = rtokens.filter((r) => r && rtokenTvl(r) > 10_000);

  if (filtered.length === 0) return [];

  // Get basketRate snapshots
  const now = Math.floor(Date.now() / 1000);
  const dayNow = Math.floor(now / 86400);
  const snapshotQuery = buildSnapshotQuery(filtered, dayNow);
  const snapshots = await request(graph, snapshotQuery);

  // Get underlying tokens from Facade
  const { output: basketTokensResult } = await sdk.api.abi.multiCall({
    chain: chainName,
    abi: facadeAbi.find(({ name }) => name === 'basketTokens'),
    calls: filtered.map((r) => ({ target: facade, params: [r.id] })),
  });

  return filtered.map((rtoken, i) => {
    // Pick best available snapshot for each period (try exact day, then day-1 fallback)
    const rateNow = parseFloat(
      snapshots[`now_${i}`]?.basketRate || snapshots[`now1_${i}`]?.basketRate || '0'
    );
    const rate7d = parseFloat(
      snapshots[`d7_${i}`]?.basketRate || snapshots[`d7b_${i}`]?.basketRate || '0'
    );
    const rate30d = parseFloat(
      snapshots[`d30_${i}`]?.basketRate || snapshots[`d30b_${i}`]?.basketRate || '0'
    );

    const apyBase =
      rate30d && rateNow
        ? ((rateNow / rate30d) ** (365 / 30) - 1) * 100
        : 0;
    const apyBase7d =
      rate7d && rateNow
        ? ((rateNow / rate7d) ** (365 / 7) - 1) * 100
        : 0;

    const underlyingTokens = basketTokensResult[i]?.output
      ? [...new Set(basketTokensResult[i].output.map((t) => t.toLowerCase()))]
      : [];

    return {
      pool: rtoken.id,
      chain: chainName,
      project: 'reserve-protocol',
      symbol: rtoken.token?.symbol,
      tvlUsd: rtokenTvl(rtoken),
      apyBase,
      apyBase7d,
      underlyingTokens,
      url: `https://app.reserve.org/${chainName}/token/${rtoken.id}/overview`,
    };
  });
};

const apy = async () => {
  const pools = await Promise.all(chains.map((chainProps) => apyChain(chainProps)));
  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
};
