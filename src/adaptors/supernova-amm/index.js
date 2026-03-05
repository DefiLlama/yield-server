const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const abiPool = require('./abiPool.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');
const abiPoolsFactory = require('./abiPoolsFactory.json');

const poolsFactory = '0x5aEf44EDFc5A7eDd30826c724eA12D7Be15bDc30';
const gaugeManager = '0x19a410046Afc4203AEcE5fbFc7A6Ac1a4F517AE2';
const SNOVA = '0x00Da8466B296E382E5Da2Bf20962D0cB87200c78';

const PROJECT = 'supernova-amm';
const CHAIN = 'ethereum';
const SUBGRAPH =
  'https://api.goldsky.com/api/public/project_cm8gyxv0x02qv01uphvy69ey6/subgraphs/sn-basic-pools-mainnet/basicsnmainnet/gn';

const query = gql`
  {
    pairs(first: 1000, orderBy: reserveUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      reserveUSD
      volumeUSD
      untrackedVolumeUSD
      feesUSD
      untrackedFeesUSD
      fee
      stable
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: reserveUSD orderDirection: desc, block: {number: <PLACEHOLDER>}) { 
      id 
      reserveUSD
      volumeUSD
      untrackedVolumeUSD 
      feesUSD
      untrackedFeesUSD
    }
  }
`;

async function getPoolVolumes(timestamp = null) {
  const [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [
    SUBGRAPH,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    CHAIN,
    timestamp,
    [SUBGRAPH],
    604800
  );

  // pull data
  let dataNow = await request(SUBGRAPH, query.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data
  let queryPriorC = queryPrior;
  let dataPrior = (await request(
    SUBGRAPH,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  )).pairs

  // 7d offset
  const dataPrior7d = (
    await request(SUBGRAPH, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs

  // calculate tvl

  const pools = {};
  for (const p of dataNow) {
    const poolAddress = utils.formatAddress(p.id);

    const p1d = dataPrior.find((i) => i.id === p.id);
    const p7d = dataPrior7d.find((i) => i.id === p.id);

    const feesUSD1d = p1d ? Number(p.untrackedFeesUSD) - Number(p1d.untrackedFeesUSD) : Number(p.untrackedFeesUSD);
    const feesUSD7d = p7d ? Number(p.untrackedFeesUSD) - Number(p7d.untrackedFeesUSD) : Number(p.untrackedFeesUSD);
    const volumeUsd1d = p1d ? Number(p.untrackedVolumeUSD) - Number(p1d.untrackedVolumeUSD) : Number(p.untrackedVolumeUSD);
    const volumeUsd7d = p7d ? Number(p.untrackedVolumeUSD) - Number(p7d.untrackedVolumeUSD) : Number(p.untrackedVolumeUSD);

    const tvlUsd = p.reserveUSD;
    const apyBase = tvlUsd > 0 ? (feesUSD1d * 365 / tvlUsd) * 100 : 0;
    const apyBase7d = tvlUsd > 0 ? (feesUSD7d * 365 / 7 / tvlUsd) * 100 : 0;
    const url = `https://supernova.xyz/deposit?token0=${p.token0.id}&token1=${p.token1.id}&pair=${p.id}&type=Basic%20${p.stable ? 'Stable' : 'Volatile'}`;
    const underlyingTokens = [p.token0.id, p.token1.id];

    pools[poolAddress] = {
      pool: poolAddress,
      chain: CHAIN,
      project: PROJECT,
      symbol: `${p.token0.symbol}-${p.token1.symbol}`,
      tvlUsd,
      apyBase,
      apyBase7d,
      underlyingTokens,
      url,
      volumeUsd1d,
      volumeUsd7d,
      feesUSD1d,
      feesUSD7d,
    };
  }

  return pools;
}

const getGaugeApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: poolsFactory,
      abi: abiPoolsFactory.find((m) => m.name === 'allPairsLength'),
      chain: CHAIN,
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: poolsFactory,
        params: [i],
      })),
      abi: abiPoolsFactory.find((m) => m.name === 'allPairs'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'metadata'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'symbol'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: gaugeManager,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  // remove pools without valid gauges
  const validIndices = [];
  const validGauges = [];
  const validPools = [];

  gauges.forEach((gauge, index) => {
    if (gauge && gauge !== '0x0000000000000000000000000000000000000000') {
      validIndices.push(index);
      validGauges.push(gauge);
      validPools.push(allPools[index]);
    }
  });

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: validGauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const poolSupply = (
    await sdk.api.abi.multiCall({
      calls: validPools.map((i) => ({ target: i })),
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: validGauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalSupply'),
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(SNOVA)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  let pricesA = [];
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `${CHAIN}:${i}`)
      .join(',')
      .replaceAll('/', '');
    try {
      const resp = await axios.get(
        `https://coins.llama.fi/prices/current/${x}`,
        { timeout: 10_000 }
      );
      if (resp?.data?.coins) pricesA = [...pricesA, resp.data.coins];
    } catch (e) {
      console.error('Failed to fetch token prices page:', e.message);
    }
  }
  let prices = {};
  for (const p of pricesA.flat()) {
    prices = { ...prices, ...p };
  }


  // fallback for SNOVA price if not on defillama
  if (!prices[`${CHAIN}:${SNOVA}`]) {
    try {
      const basicSubgraph = 'https://api.goldsky.com/api/public/project_cm8gyxv0x02qv01uphvy69ey6/subgraphs/sn-basic-pools-mainnet/basicsnmainnet/gn';
      const snovaUsdcPool = '0x4f20c37766759c3956f030d2e8749d493ef86e94';
      const { pair } = await request(
        basicSubgraph,
        gql`
                  {
                      pair(id: "${snovaUsdcPool}") {
                          token0Price
                      }
                  }
                  `
      );
      if (pair && pair.token0Price) {
        prices[`${CHAIN}:${SNOVA}`] = { price: Number(pair.token0Price) };
      }
    } catch (e) {
      console.error('Failed to fetch fallback SNOVA price:', e.message);
    }
  }
  // Fetch subgraph TVL data to join with valid pools
  let subgraphPairs = [];
  try {
    const resp = await request(
      SUBGRAPH,
      gql`
        {
          pairs(first: 1000) {
            id
            reserveUSD
          }
        }
      `
    );
    subgraphPairs = resp?.pairs ?? [];
  } catch (e) {
    console.error('Failed to fetch subgraph TVL data:', e.message);
  }

  const pools = validPools.map((p, i) => {
    const originalIndex = validIndices[i];
    const poolMeta = metaData[originalIndex];
    const s = symbols[originalIndex];
    // Find TVL from subgraph using reserveUSD
    const spr = subgraphPairs.find(sp => sp.id.toLowerCase() === p.toLowerCase());
    const tvlUsd = spr ? Number(spr.reserveUSD) : 0;

    // Only staked supply is eligible for the rewardRate's emissions
    const ts = Number(totalSupply[i] || 0);
    const ps = Number(poolSupply[i] || 0);
    const stakedSupplyRatio = ts > 0 ? ps / ts : 0;

    const snovaPrice = prices[`${CHAIN}:${SNOVA}`]?.price || 0;

    const rr = Number(rewardRate[i] || 0);
    const apyReward =
      tvlUsd > 0 && snovaPrice > 0 && rr > 0
        ? (((rr / 1e18) * 86400 * 365 * snovaPrice) / tvlUsd) *
        stakedSupplyRatio *
        100
        : 0;

    return {
      pool: utils.formatAddress(p),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: s.includes('-') ? s.split('-').slice(1).join('-').replace('/', '-') : s,
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [SNOVA] : [],
      underlyingTokens: [poolMeta.t0.toLowerCase(), poolMeta.t1.toLowerCase()],
      stable: poolMeta.st,
    };
  });

  const poolsApy = {};
  for (const pool of pools.filter((p) => utils.keepFinite(p))) {
    poolsApy[pool.pool] = pool;
  }

  return poolsApy;
};

async function main(timestamp = null) {
  const poolsApy = await getGaugeApy();
  let poolsVolumes = {};
  try {
    poolsVolumes = await getPoolVolumes(timestamp);
  } catch (e) {
    console.log('Failed to fetch volume data from subgraph:', e.message);
  }

  // left-join volumes onto APY output to avoid filtering out pools
  return Object.values(poolsApy).map((pool) => {
    const { stable, ...rest } = pool;
    const v = poolsVolumes[pool.pool];
    const type = stable ? 'Stable' : 'Volatile';
    return {
      ...rest,
      url: `https://supernova.xyz/deposit?token0=${pool.underlyingTokens[0]}&token1=${pool.underlyingTokens[1]}&pair=${pool.pool}&type=Basic%20${type}`,
      apyBase: v?.apyBase || 0,
      apyBase7d: v?.apyBase7d || 0,
      volumeUsd1d: v?.volumeUsd1d || 0,
      volumeUsd7d: v?.volumeUsd7d || 0,
    };
  });
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://supernova.xyz/liquidity',
};
