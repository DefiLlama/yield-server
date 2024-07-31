const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xAAA20D08e59F6561f242b08513D36266C5A29415';
const voter = '0xAAA2564DEb34763E3d05162ed3f5C2658691f499';
const RAM = '0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418';
const chains = {
  arbitrum: sdk.graph.modifyEndpoint(
    'G2tXDm6mgqBMuC7hq9GRVeTv5SRBAVnPFGcpGBab2cea'
  ),
};

const superagent = require('superagent');
const { EstimatedFees } = require('./estimateFee');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');
const { getCdpTotalSupply } = require('../nitron/helper');

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
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
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

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
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
      chainString,
      timestamp,
      [url],
      604800
    );

    // pull data
    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pools;

    // uni v3 subgraph reserves values are wrong!
    // instead of relying on subgraph values, gonna pull reserve data from contracts
    // new tvl calc
    const balanceCalls = [];
    for (const pool of dataNow) {
      balanceCalls.push({
        target: pool.token0.id,
        params: pool.id,
      });
      balanceCalls.push({
        target: pool.token1.id,
        params: pool.id,
      });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
      permitFailure: true,
    });

    const gauges = (
      await sdk.api.abi.multiCall({
        calls: dataNow.map((p) => ({
          target: voter,
          params: [p.id],
        })),
        abi: abiVoter.find((m) => m.name === 'gauges'),
        chain: 'arbitrum',
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const rewardRate = (
      await sdk.api.abi.multiCall({
        calls: gauges.map((i) => ({
          target: i,
          params: [RAM],
        })),
        abi: abiGauge.find((m) => m.name === 'rewardRate'),
        chain: 'arbitrum',
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const totalSupply = (
      await sdk.api.abi.multiCall({
        calls: dataNow.map((p) => ({
          target: p.id,
        })),
        abi: abiPair.find((m) => m.name === 'boostedLiquidity'),
        chain: 'arbitrum',
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    dataNow = dataNow.map((p, i) => {
      const x = tokenBalances.output.filter(
        (item) => item.input.params[0] === p.id
      );

      return {
        ...p,
        reserve0:
          x.find((item) => item.input.target === p.token0.id).output /
          `1e${p.token0.decimals}`,
        reserve1:
          x.find((item) => item.input.target === p.token1.id).output /
          `1e${p.token1.decimals}`,
        supply: totalSupply[i],
        gauge: gauges[i],
        reward: rewardRate[i],
      };
    });

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    let dataPrior = await request(
      url,
      queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

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
    dataNow = dataNow.map((el, i) =>
      utils.apy(el, dataPrior, dataPrior7d, version, i)
    );

    const enableV3Apy = false;
    if (enableV3Apy && chainString !== 'arbitrum') {
      dataNow = dataNow.map((p, i) => ({
        ...p,
        token1_in_token0: p.price1 / p.price0,
        volumeUSD7d: dataPrior7d[i].volumeUSD,
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

    const tokenReward = 'arbitrum:0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418';

    const prices = (
      await axios.get(
        `https://coins.llama.fi/prices/current/arbitrum:0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418`
      )
    ).data.coins;

    return dataNow.map((p, i) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
      const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
      const pairPrice = (p.totalValueLockedUSD * 1e18) / p.supply;
      const totalRewardPerDay =
        ((p.reward * 86400 * 4) / 1e18) * prices[tokenReward]?.price;
      const apyReward = (totalRewardPerDay * 36500) / p.totalValueLockedUSD;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://cl.ramses.exchange/#/add/${token0}/${token1}/${feeTier}`;

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'ramses-cl',
        poolMeta: `${poolMeta}, stablePool=${p.stablecoin}`,
        symbol: p.symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d * 0.25,
        apyBase7d: p.apy7d * 0.25,
        apyReward: apyReward,
        rewardTokens: apyReward ? [RAM] : [],
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
