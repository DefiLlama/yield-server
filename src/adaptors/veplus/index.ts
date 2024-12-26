const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');
const { request, gql } = require('graphql-request');

const SUBGRAPH_URL = sdk.graph.modifyEndpoint(
  'FEYBMUkep7BKAoxP9mX9ZF733SvnTbNMWE9tgtNTw83g'
);

const pairFactory = '0x5Bcd9eE6C31dEf33334b255EE7A767B6EEDcBa4b';
const voter = '0x792Ba5586E87005661C4e611b17e01De0de42599';
const VEP = '0x1e32B79d8203AC691499fBFbB02c07A9C9850Dd7';
const VEP_USDT_PAIR = '0xcb369dbd43de4a5f1d4341cf6621076a6ce668cd';

const pairsQuery = gql`
  query pairQuery {
    pair(id: "0xcb369dbd43de4a5f1d4341cf6621076a6ce668cd") {
      token1Price
    }
  }
`;

const getVEPPrice = async () => {
  const { pair } = await request(SUBGRAPH_URL, pairsQuery, {
    pair: VEP_USDT_PAIR.toLowerCase(),
  });
  return pair.token1Price;
};

const getApy = async () => {
  const vep_price = await getVEPPrice();

  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain: 'bsc',
    })
  ).output;
  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
        params: VEP,
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'bsc',
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(VEP)
    ),
  ];
  const priceKeys = tokens.map((i) => `bsc:${i}`).join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];

    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    let p0, p1;
    if (poolMeta.t0 == VEP) {
      p0 = vep_price;
    } else {
      p0 = prices[`bsc:${poolMeta.t0}`]?.price;
    }

    if (poolMeta.t1 == VEP) {
      p1 = vep_price;
    } else {
      p1 = prices[`bsc:${poolMeta.t1}`]?.price;
    }

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const totalRewardPerDay = ((rewardRate[i] * 86400) / 1e18) * vep_price;

    const apyReward = (totalRewardPerDay * 36500) / tvlUsd;

    return {
      pool: p,
      chain: utils.formatChain('bsc'),
      project: 'veplus',
      symbol: utils.formatSymbol(s.replace('/', '-')),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [VEP] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.veplus.io/pools',
};
