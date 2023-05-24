const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const gaugeABIEthereum = require('./abis/gauge_ethereum.json');
const gaugeABIArbitrum = require('./abis/gauge_arbitrum.json');
const gaugeABIPolygon = require('./abis/gauge_polygon.json');
const gaugeControllerEthereum = require('./abis/gauge_controller_ethereum.json');
const protocolFeesCollectorABI = require('./abis/protocol_fees_collector.json');
const { lte } = require('lodash');

// Subgraph URLs
const urlBase = 'https://api.thegraph.com/subgraphs/name/balancer-labs';
const urlEthereum = `${urlBase}/balancer-v2`;
const urlPolygon = `${urlBase}/balancer-polygon-v2`;
const urlArbitrum = `${urlBase}/balancer-arbitrum-v2`;

const urlGaugesEthereum = `${urlBase}/balancer-gauges`;
const urlGaugesPolygon = `${urlBase}/balancer-gauges-polygon`;
const urlGaugesArbitrum = `${urlBase}/balancer-gauges-arbitrum`;

const protocolFeesCollector = '0xce88686553686DA562CE7Cea497CE749DA109f9F';
const gaugeController = '0xC128468b7Ce63eA702C1f104D55A2566b13D3ABD';

const BAL = '0xba100000625a3754423978a60c9317c58a424e3d';

const queryGauge = gql`
  {
    liquidityGauges(first: 200) {
      id
      symbol
      poolId
      totalSupply
      factory {
        id
      }
      tokens {
        id
        symbol
        decimals
      }
    }
  }
`;

const query = gql`
  {
    pools(
      first: 200
      orderBy: "totalLiquidity"
      orderDirection: "desc"
      where: { totalShares_gt: 0.01 }
      skip: 0
    ) {
      id
      tokensList
      totalSwapFee
      totalShares
      tokens {
        address
        balance
        symbol
      }
    }
  }
`;

const queryPrior = gql`
{
  pools(
    first: 1000
    orderBy: "totalLiquidity"
    orderDirection: "desc"
    where: { totalShares_gt: 0.01 }
    block: {number: <PLACEHOLDER>}
  ) { 
    id 
    tokensList 
    totalSwapFee 
    tokens { 
      address 
      balance 
      symbol 
    } 
  }
}
`;

// for Balancer Aave Boosted StablePool (there are 2 pools, but underlying addresses for one of them
// don't return any price data from our api, the other pool does though and both have the same underlying tokens)
// specifically, bb-a-usdc, bb-a-dai, bb-a-usdt
// -> use this mapping to get price data for both of them
const bbTokenMapping = {
  '0x2f4eb100552ef93840d5adc30560e5513dfffacb':
    '0x2bbf681cc4eb09218bee85ea2a5d3d13fa40fc0c',
  '0x82698aecc9e28e9bb27608bd52cf57f704bd1b83':
    '0x9210f1204b5a24742eba12f710636d76240df3d0',
  '0xae37d54ae477268b9997d4161b96b8200755935c':
    '0x804cdb9116a10bb78768d3252355a1b18067bf8f',
};

// for Balancer Aave Boosted StablePool on Polygon there is no price data
// Using underlying assets for price
const polygonBBTokenMapping = {
  '0x178e029173417b1f9c8bc16dcec6f697bc323746':
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // DAI
  '0xf93579002dbe8046c43fefe86ec78b1112247bb8':
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC
  '0xff4ce5aaab5a627bf82f4a571ab1ce94aa365ea6':
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT
};

const correctMaker = (entry) => {
  entry = { ...entry };
  // for some reason the MKR symbol is not there, add this manually for
  // token address 0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2 = makerdao
  for (const x of entry.tokens) {
    if (x.address === '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2') {
      x.symbol = 'MKR';
    }
  }

  return entry;
};

const tvl = (entry, tokenPriceList, chainString) => {
  entry = { ...entry };

  const balanceDetails = entry.tokens.filter(
    (t) =>
      ![
        'B-STETH-Stable',
        'B-STMATIC-STABLE',
        'B-MATICX-STABLE',
        'B-CSMATIC',
        'CBETH-WSTETH-BPT',
      ].includes(t.symbol.toUpperCase().trim())
  );
  const d = {
    id: entry.id,
    symbol: balanceDetails.map((tok) => tok.symbol).join('-'),
    tvl: 0,
    totalShares: entry.totalShares,
    tokensList: entry.tokensList,
  };
  const symbols = [];
  const tokensList = [];
  let price;
  for (const el of balanceDetails) {
    price = tokenPriceList[`${chainString}:${el.address.toLowerCase()}`]?.price;
    if (
      el.address.toLowerCase() ===
      '0x7dff46370e9ea5f0bad3c4e29711ad50062ea7a4'.toLowerCase()
    )
      price =
        tokenPriceList['solana:So11111111111111111111111111111111111111112']
          ?.price;
    if (
      entry.id ===
      '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d'
    ) {
      price = tokenPriceList[`ethereum:${bbTokenMapping[el.address]}`]?.price;
    }
    if (
      chainString == 'polygon' &&
      entry.id ===
        '0x48e6b98ef6329f8f0a30ebb8c7c960330d64808500000000000000000000075b'
    ) {
      price =
        tokenPriceList[`polygon:${polygonBBTokenMapping[el.address]}`]?.price;
    }
    price = price ?? 0;
    d.tvl += Number(el.balance) * price;
  }

  return d;
};

const aprLM = async (tvlData, urlLM, queryLM, chainString, gaugeABI) => {
  // copy
  const data = tvlData.map((a) => ({ ...a }));

  // get liquidity gauges for each pool
  const { liquidityGauges } = await request(urlLM, queryLM);

  // get BAL inflation rate (constant among gauge contract ids)
  let inflationRate;
  let price;
  if (chainString === 'ethereum') {
    inflationRate =
      (
        await sdk.api.abi.call({
          target: liquidityGauges[0].id,
          abi: gaugeABI.find((n) => n.name === 'inflation_rate'),
          chain: chainString,
        })
      ).output / 1e18;

    // get BAL price
    const key = `${chainString}:${BAL}`;
    price = (
      await superagent.post('https://coins.llama.fi/prices').send({
        coins: [key],
      })
    ).body.coins[key].price;
  }

  // add LM rewards if available to each pool in data
  for (const pool of liquidityGauges) {
    try {
      const x = data.find((el) => el.id === pool.poolId);
      if (x === undefined) {
        continue;
      }

      const aprLMRewards = [];
      const rewardTokens = [];

      if (chainString === 'ethereum') {
        // get relative weight (of base BAL token rewards for a pool)
        const relativeWeight =
          (
            await sdk.api.abi.call({
              target: gaugeController,
              abi: gaugeControllerEthereum.find(
                (n) => n.name === 'gauge_relative_weight'
              ),
              params: [pool.id],
              chain: 'ethereum',
            })
          ).output / 1e18;

        // for base BAL rewards
        if (relativeWeight !== 0) {
          const workingSupply =
            (
              await sdk.api.abi.call({
                target: pool.id,
                abi: gaugeABI.find((n) => n.name === 'working_supply'),
                chain: 'ethereum',
              })
            ).output / 1e18;

          // bpt == balancer pool token
          const bptPrice = x.tvl / x.totalShares;
          const balPayable = inflationRate * 7 * 86400 * relativeWeight;
          const weeklyReward = (0.4 / (workingSupply + 0.4)) * balPayable;
          const yearlyReward = weeklyReward * 52 * price;
          const aprLM = (yearlyReward / bptPrice) * 100;
          aprLMRewards.push(aprLM === Infinity ? 0 : aprLM);
          rewardTokens.push(BAL);
        }
      }

      // first need to find the reward token
      // (balancer UI loops up to 8times, will replicate the same logic)
      const MAX_REWARD_TOKENS = 8;
      for (let i = 0; i < MAX_REWARD_TOKENS; i++) {
        // get token reward address
        const add = (
          await sdk.api.abi.call({
            target: pool.id,
            abi: gaugeABI.find((n) => n.name === 'reward_tokens'),
            params: [i],
            chain: chainString,
          })
        ).output.toLowerCase();
        if (add === '0x0000000000000000000000000000000000000000') {
          break;
        }

        // get cg price of reward token
        const key = `${chainString}:${add}`;
        const price = (
          await superagent.post('https://coins.llama.fi/prices').send({
            coins: [key],
          })
        ).body.coins[key]?.price;

        // call reward data
        const { rate, period_finish } = (
          await sdk.api.abi.call({
            target: pool.id,
            abi: gaugeABI.find((n) => n.name === 'reward_data'),
            params: [add],
            chain: chainString,
          })
        ).output;

        if (period_finish * 1000 < new Date().getTime()) continue;
        const inflationRate = rate / 1e18;
        const tokenPayable = inflationRate * 7 * 86400;
        const totalSupply =
          (
            await sdk.api.abi.call({
              target: pool.id,
              abi: gaugeABI.find((n) => n.name === 'totalSupply'),
              chain: chainString,
            })
          ).output / 1e18;

        const weeklyRewards = (1 / (totalSupply + 1)) * tokenPayable;
        const yearlyRewards = weeklyRewards * 52 * price;
        const bptPrice = x.tvl / x.totalShares;
        const aprLM = (yearlyRewards / bptPrice) * 100;

        aprLMRewards.push(aprLM === Infinity ? null : aprLM);
        rewardTokens.push(add);
      }
      // add up individual LM rewards
      x.aprLM = aprLMRewards
        .filter((i) => isFinite(i))
        .reduce((a, b) => a + b, 0);

      x.rewardTokens = rewardTokens;
    } catch (err) {
      console.log(err);
    }
  }
  return data;
};

const aprFee = (el, dataNow, dataPrior, swapFeePercentage) => {
  const swapFeeNow = dataNow.find((x) => x.id === el.id)?.totalSwapFee;
  const swapFeePrior = dataPrior.find((x) => x.id === el.id)?.totalSwapFee;
  const swapFee24h = Number(swapFeeNow) - Number(swapFeePrior);

  el.aprFee = ((swapFee24h * 365) / el.tvl) * 100 * swapFeePercentage;
  return el;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  urlGauge,
  queryGauge,
  gaugeABI,
  swapFeePercentage
) => {
  const [_, blockPrior] = await utils.getBlocks(chainString, null, [url]);
  // pull data
  let dataNow = await request(url, query);
  let dataPrior = await request(
    url,
    queryPrior.replace('<PLACEHOLDER>', blockPrior)
  );

  // correct for missing maker symbol
  dataNow = dataNow.pools.map((el) => correctMaker(el));
  dataPrior = dataPrior.pools.map((el) => correctMaker(el));

  // for tvl, we gonna pull token prices from our price api, which we use to calculate tvl
  // note: the subgraph already comes with usd tvl values, but sometimes they are inflated
  const tokenList = [
    ...new Set(
      dataNow
        .map((el) => el.tokens)
        .flat()
        .map((el) => el.address)
    ),
  ];

  const tokenPriceList = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: tokenList
        .map((t) => `${chainString}:${t}`)
        .concat(['solana:So11111111111111111111111111111111111111112']),
    })
  ).body.coins;

  // calculate tvl
  let tvlInfo = dataNow.map((el) => tvl(el, tokenPriceList, chainString));

  // calculate fee apy
  tvlInfo = tvlInfo.map((el) =>
    aprFee(el, dataNow, dataPrior, swapFeePercentage)
  );

  // calculate reward apr
  tvlInfo = await aprLM(tvlInfo, urlGauge, queryGauge, chainString, gaugeABI);

  // build pool objects
  return tvlInfo.map((p) => {
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'balancer-v2',
      symbol: utils.formatSymbol(p.symbol),
      tvlUsd: p.tvl,
      apyBase: p.aprFee,
      apyReward:
        p.id ===
        '0x8167a1117691f39e05e9131cfa88f0e3a620e96700020000000000000000038c' // WETH-T wrong bal apr
          ? 0
          : p.aprLM,
      rewardTokens: p.rewardTokens,
      underlyingTokens: p.tokensList,
      url: `https://${
        chainString === 'ethereum' ? 'app' : chainString
      }.balancer.fi/#/pool/${p.id}`,
    };
  });
};

const main = async () => {
  // balancer splits off a pct cut of swap fees to the protocol, get pct value:
  const swapFeePercentage =
    (
      await sdk.api.abi.call({
        target: protocolFeesCollector,
        abi: protocolFeesCollectorABI.find(
          (n) => n.name === 'getSwapFeePercentage'
        ),
        chain: 'ethereum',
      })
    ).output / 1e18;

  const data = await Promise.all([
    topLvl(
      'ethereum',
      urlEthereum,
      query,
      queryPrior,
      urlGaugesEthereum,
      queryGauge,
      gaugeABIEthereum,
      swapFeePercentage
    ),
    topLvl(
      'polygon',
      urlPolygon,
      query,
      queryPrior,
      urlGaugesPolygon,
      queryGauge,
      gaugeABIPolygon,
      swapFeePercentage
    ),
    topLvl(
      'arbitrum',
      urlArbitrum,
      query,
      queryPrior,
      urlGaugesArbitrum,
      queryGauge,
      gaugeABIArbitrum,
      swapFeePercentage
    ),
  ]);

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
