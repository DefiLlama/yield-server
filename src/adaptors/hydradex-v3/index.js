const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { EstimatedFees } = require('../uniswap-v3/estimateFee.ts');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');

const WHYDRA = '0x6d9115a21863ce31b44cd231e4c4ccc87566222f';
const ignoreIncentives = [
  '0x3fd993e02095478ec7272d949f5c63dfece7eed8c884ff46035f301b37707754',
  '0xa8235e34eba238ccf1cf952f853e1a095637be92c1f4fe4fee07240d2b8e545f',
  '0xc87f5d3ed6c61582bc4b866202c0953730121615e3560d2c18539e6ba2babccd',
  '0xff8b5ea09291191f6eca3ea3d827daa094cebc75734935656aa6cd932b3bc448',
];

const baseUrl = 'https://graph.hydradex.org/subgraphs/name/v3-subgraph';
const blocksUrl =
  'https://graph.hydradex.org/subgraphs/name/blocklytics/ethereum-blocks';
const incentivesUrl = 'https://graph.hydradex.org/subgraphs/name/v3-staker';
const chains = {
  hydra: baseUrl,
};

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      totalValueLockedUSD
      totalValueLockedETH
      volumeUSD
      feeTier
      token0Price
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const queryBlocks = gql`
  {
    blocks(
      orderBy: "number"
      first: 1
      orderDirection: "desc"
      where: { timestamp_lte: <PLACEHOLDER> }
    ) {
      number
    }
  }
`;

const queryIncentives = gql`
  {
    incentives(
      where: {
        startTime_lte: <START_PLACEHOLDER>
        endTime_gt: <END_PLACEHOLDER>
        pool_in: <POOLS_PLACEHOLDER>
      }
    ) {
      pool
      id
      startTime
      endTime
      reward
    }
  }
`;

const getV3Blocks = async (tsTimeTravel, offset = 86400) => {
  const timestamp =
    tsTimeTravel !== null
      ? Number(tsTimeTravel)
      : Math.floor(Date.now() / 1000);

  const timestampPrior = timestamp - offset;

  const blocks = [];
  for (const ts of [timestamp, timestampPrior]) {
    const data = (
      await request(blocksUrl, queryBlocks.replace('<PLACEHOLDER>', ts))
    ).blocks;
    blocks.push(data[0].number);
  }

  return blocks;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp,
  stablecoins
) => {
  try {
    const [block, blockPrior] = await getV3Blocks(timestamp);

    const [_, blockPrior7d] = await getV3Blocks(timestamp, 604800);

    // pull data
    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pools;

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    let dataPrior = await request(
      url,
      queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    // map reserves
    dataNow = dataNow.map((p) => ({
      ...p,
      reserve0: Number(p.totalValueLockedToken0),
      reserve1: Number(p.totalValueLockedToken1),
      totalValueLockedUSD: Number(p.totalValueLockedUSD),
    }));

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= boundaries.tvlUsdDB.lb
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = utils.formatSymbol(
        `${p.token0.symbol}-${p.token1.symbol}`
      );
      const stablecoin = checkStablecoin({ ...p, symbol }, stablecoins);
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

    // for new v3 apy calc
    const dataPrior7d = (
      await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    ).pools;

    // calc apy (note: old way of using 24h fees * 365 / tvl. keeping this for now) and will store the
    // new apy calc as a separate field
    // note re arbitrum: their subgraph is outdated (no tick data -> no uni v3 style apy calc)

    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    const enableV3Apy = false;
    if (enableV3Apy) {
      dataNow = dataNow.map((p) => ({
        ...p,
        token1_in_token0: p.token0Price,
      }));

      // split up subgraph tick calls into n-batches
      // (tick response can be in the thousands per pool)
      const skip = 20;
      let start = 0;
      let stop = skip;
      const pages = Math.floor(dataNow.length / skip);

      // tick range
      const pct = 0.3;
      const pctStablePool = 0.001;

      // assume an investment of 1e5 USD
      const investmentAmount = 1e5;
      let X = [];
      for (let i = 0; i <= pages; i++) {
        console.log(i);
        let promises = dataNow.slice(start, stop).map((p) => {
          const delta = p.stablecoin ? pctStablePool : pct;

          const priceAssumption = p.stablecoin ? 1 : p.token1_in_token0;

          return EstimatedFees(
            p.id,
            priceAssumption,
            [
              p.token1_in_token0 * (1 - delta),
              p.token1_in_token0 * (1 + delta),
            ],
            p.price1,
            p.price0,
            investmentAmount,
            p.token0.decimals,
            p.token1.decimals,
            p.feeTier,
            url,
            p.volumeUSD7d
          );
        });
        X.push(await Promise.all(promises));
        start += skip;
        stop += skip;
      }
      const d = {};
      X.flat().forEach((p) => {
        d[p.poolAddress] = p.estimatedFee;
      });

      dataNow = dataNow.map((p) => ({
        ...p,
        apy7d: ((d[p.id] * 52) / investmentAmount) * 100,
      }));
    }

    const ts =
      timestamp !== null ? Number(timestamp) : Math.floor(Date.now() / 1000);
    const incentives = (
      await request(
        incentivesUrl,
        queryIncentives
          .replace('<START_PLACEHOLDER>', ts)
          .replace('<END_PLACEHOLDER>', ts)
          .replace(
            '<POOLS_PLACEHOLDER>',
            JSON.stringify(dataNow.map((p) => p.id))
          )
      )
    ).incentives;

    const incentivesReward = incentives.reduce((acc, cur) => {
      if (ignoreIncentives.includes(cur.id)) return acc;

      const duration = (cur.endTime - cur.startTime) / 60 / 60 / 24;
      const annualReward = (cur.reward / 1e8) * (365.25 / duration);

      if (!acc[cur.pool]) {
        acc[cur.pool] = 0;
      }

      acc[cur.pool] += annualReward;
      return acc;
    }, {});

    return dataNow.map((p) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
      const chain = chainString === 'hydra' ? 'mainnet' : chainString;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://hydradex.org/#/add/${token0}/${token1}/${feeTier}`;

      const apyReward =
        ((incentivesReward[p.id] || 0) / p.totalValueLockedETH) * 100;
      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'hydradex-v3',
        poolMeta: `${poolMeta}, stablePool=${p.stablecoin}`,
        symbol: p.symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d,
        apyBase7d: p.apy7d,
        apyReward: apyReward || undefined,
        rewardTokens: apyReward ? [WHYDRA] : undefined,
        underlyingTokens,
        url,
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
      };
    });
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async (timestamp = null) => {
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  const data = [];
  for (const [chain, url] of Object.entries(chains)) {
    console.log(chain);
    data.push(
      await topLvl(chain, url, query, queryPrior, 'v3', timestamp, stablecoins)
    );
  }
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
