const axios = require('axios');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const gaugeABIEthereum = require('./abis/gauge_ethereum.json');
const gaugeABIArbitrum = require('./abis/gauge_arbitrum.json');
const gaugeABIPolygon = require('./abis/gauge_polygon.json');
const gaugeABIGnosis = require('./abis/gauge_gnosis.json');
const gaugeABIBase = require('./abis/gauge_base.json');
const balTokenAdminABI = require('./abis/balancer_token_admin.json');
const gaugeControllerEthereum = require('./abis/gauge_controller_ethereum.json');
const protocolFeesCollectorABI = require('./abis/protocol_fees_collector.json');
const { lte } = require('lodash');
const { getChildChainRootGauge } = require('./childChainGauges.js');

// Subgraph URLs
const urlEthereum = sdk.graph.modifyEndpoint(
  'C4ayEZP2yTXRAB8vSaTrgN4m9anTe9Mdm2ViyiAuV9TV'
);
const urlPolygon = sdk.graph.modifyEndpoint(
  'H9oPAbXnobBRq1cB3HDmbZ1E8MWQyJYQjT1QDJMrdbNp'
);
const urlGnosis = sdk.graph.modifyEndpoint(
  'EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg'
);
const urlArbitrum = sdk.graph.modifyEndpoint(
  '98cQDy6tufTJtshDCuhh9z2kWXsQWBHVh2bqnLHsGAeS'
);
const urlBaseChain = sdk.graph.modifyEndpoint(
  'E7XyutxXVLrp8njmjF16Hh38PCJuHm12RRyMt5ma4ctX'
);
const urlAvalanche = sdk.graph.modifyEndpoint(
  '7asfmtQA1KYu6CP7YVm5kv4bGxVyfAHEiptt2HMFgkHu'
);

const urlGaugesEthereum = sdk.graph.modifyEndpoint(
  '4sESujoqmztX6pbichs4wZ1XXyYrkooMuHA8sKkYxpTn'
);
const urlGaugesPolygon = sdk.graph.modifyEndpoint(
  'AkD2HEjNoupFb1y3fERdhmFC1UbKvQUBwsu5fREAEcJd'
);
const urlGaugesGnosis = sdk.graph.modifyEndpoint(
  '4nTERBBaGRc1PgLcGvtvvqupSFu7y8Ee2xKZFNM5aw56'
);
const urlGaugesArbitrum = sdk.graph.modifyEndpoint(
  'Bb1hVjJZ52kL23chZyyGWJKrGEg3S6euuNa1YA6XRU4J'
);
const urlGaugesBase = `https://api.studio.thegraph.com/query/24660/balancer-gauges-base/version/latest`;
const urlGaugesAvalanche = sdk.graph.modifyEndpoint(
  'BZ2DkZkaQKdBqDTRdur8kHM95ZFVt4fBudKmnvobiyN'
);

const protocolFeesCollector = '0xce88686553686DA562CE7Cea497CE749DA109f9F';
const gaugeController = '0xC128468b7Ce63eA702C1f104D55A2566b13D3ABD';
const balancerTokenAdmin = '0xf302f9F50958c5593770FDf4d4812309fF77414f';

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
        weight
      }
      address
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
      weight
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

// for Balancer Agave Boosted StablePool on Gnosis there is no price data
// Using underlying assets for price
const gnosisBBTokenMapping = {
  '0x41211bba6d37f5a74b22e667533f080c7c7f3f13':
    '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', // wxDAI
  '0xe7f88d7d4ef2eb18fcf9dd7216ba7da1c46f3dd6':
    '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83', // USDC
  '0xd16f72b02da5f51231fde542a8b9e2777a478c88':
    '0x4ecaba5870353805a9f068101a40e0f32ed605c6', // USDT
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

const normalizeAddress = (address) => address?.toLowerCase();

const poolAddress = (entry) =>
  normalizeAddress(entry.address || entry.id?.slice(0, 42));

const isPoolToken = (tokenAddress, entry) => {
  const address = poolAddress(entry);
  return address !== undefined && normalizeAddress(tokenAddress) === address;
};

const tvl = (entry, tokenPriceList, chainString) => {
  entry = { ...entry };

  // remove the pool address from tvl calculation to calculate tvl from underlying tokens only
  let balanceDetails = entry.tokens.filter((i) => i.address !== entry.address);

  balanceDetails = balanceDetails.filter(
    (t) =>
      ![
        'B-STETH-Stable',
        'B-STMATIC-STABLE',
        'B-MATICX-STABLE',
        'B-CSMATIC',
        'CBETH-WSTETH-BPT',
        'ANKRETH/WSTETH',
        'GHO/BB-A-USD',
        'B-ETHX/BB-A-WETH',
        'ETHX-WETH-BPT',
        'SAVAX-WAVAX-BPT',
        'GGAVAX-WAVAX-BPT',
        'YYAVAX-WAVAX-BPT',
      ].includes(t.symbol.toUpperCase().trim())
  );

  const d = {
    id: entry.id,
    symbol: balanceDetails.map((tok) => tok.symbol).join('-'),
    tvl: 0,
    totalShares: entry.totalShares,
    tokensList: (entry.tokensList || []).filter(
      (token) => !isPoolToken(token, entry)
    ),
  };
  const emptyPrice = [];
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
    if (
      chainString == 'xdai' &&
      entry.id ===
        '0xfedb19ec000d38d92af4b21436870f115db22725000000000000000000000010'
    ) {
      price = tokenPriceList[`xdai:${gnosisBBTokenMapping[el.address]}`]?.price;
    }
    if (price === undefined) {
      emptyPrice.push(el);
    }
    price = price ?? 0;
    d.tvl += Number(el.balance) * price;
  }

  if (entry.tokens.length === 2 && emptyPrice.length === 1) {
    // use weight to correct tvl
    const multiplier = 1 / (1 - Number(emptyPrice[0].weight));
    d.tvl *= multiplier;
  }

  return d;
};

const aprLM = async (tvlData, urlLM, queryLM, chainString, gaugeABI) => {
  // copy
  const data = tvlData.map((a) => ({ ...a }));

  // get liquidity gauges for each pool
  const childChainRootGaugesPromise =
    chainString != 'ethereum'
      ? getChildChainRootGauge(
          chainString === 'avax'
            ? 'avalanche'
            : chainString === 'xdai'
            ? 'gnosis'
            : chainString
        )
      : Promise.resolve([]);

  const balKey = `ethereum:${BAL}`.toLowerCase();
  const [
    { liquidityGauges },
    childChainRootGauges,
    inflationRateResult,
    balPriceResult,
  ] = await Promise.all([
    request(urlLM, queryLM),
    childChainRootGaugesPromise,
    // Global source of truth for the inflation rate. All mainnet gauges use the BalancerTokenAdmin contract to update their locally stored inflation rate during checkpoints.
    sdk.api.abi.call({
        target: balancerTokenAdmin,
        abi: balTokenAdminABI.find((n) => n.name === 'getInflationRate'),
        chain: 'ethereum',
      }),
    utils.getPriceApiData(`/prices/current/${balKey}`),
  ]);

  const inflationRate = inflationRateResult.output / 1e18;
  const balPrice = balPriceResult.coins[balKey].price;
  const dataById = new Map(data.map((el) => [el.id, el]));
  const rootGaugeByRecipient = new Map(
    childChainRootGauges.map((gauge) => [gauge.recipient, gauge.id])
  );

  const gauges = liquidityGauges
    .map((pool) => {
      const x = dataById.get(pool.poolId);
      if (x === undefined) return null;

      return {
        pool,
        x,
        relativeWeightParams:
          chainString === 'ethereum'
            ? pool.id
            : rootGaugeByRecipient.get(pool.id) || pool.id,
        aprLMRewards: [],
        rewardTokens: [],
      };
    })
    .filter(Boolean);

  if (!gauges.length) return data;

  const relativeWeights = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((gauge) => ({
        target: gaugeController,
        params: [gauge.relativeWeightParams],
      })),
      abi: gaugeControllerEthereum.find(
        (n) => n.name === 'gauge_relative_weight'
      ),
      chain: 'ethereum',
      permitFailure: true,
    })
  ).output.map((o) => Number(o.output || 0) / 1e18);

  const gaugesWithBalRewards = gauges
    .map((gauge, index) => ({ ...gauge, relativeWeight: relativeWeights[index] }))
    .filter((gauge) => gauge.relativeWeight !== 0);

  if (gaugesWithBalRewards.length) {
    const workingSupplies = (
      await sdk.api.abi.multiCall({
        calls: gaugesWithBalRewards.map((gauge) => ({
          target: gauge.pool.id,
        })),
        abi: gaugeABI.find((n) => n.name === 'working_supply'),
        chain: chainString,
        permitFailure: true,
      })
    ).output.map((o) => Number(o.output || 0) / 1e18);

    gaugesWithBalRewards.forEach((gauge, index) => {
      const workingSupply = workingSupplies[index];
      const bptPrice = gauge.x.tvl / gauge.x.totalShares;
      const balPayable = inflationRate * 7 * 86400 * gauge.relativeWeight;
      const weeklyReward = (0.4 / (workingSupply + 0.4)) * balPayable;
      const yearlyReward = weeklyReward * 52 * balPrice;
      const aprLM = (yearlyReward / bptPrice) * 100;
      gauge.aprLMRewards.push(aprLM === Infinity ? 0 : aprLM);
      gauge.rewardTokens.push(BAL);
    });
  }

  // first need to find the reward token
  // (balancer UI loops up to 8times, will replicate the same logic)
  const MAX_REWARD_TOKENS = 8;
  const rewardTokenCallMeta = [];
  const rewardTokenCalls = gauges.flatMap((gauge, gaugeIndex) =>
    [...Array(MAX_REWARD_TOKENS).keys()].map((rewardIndex) => {
      rewardTokenCallMeta.push({ gaugeIndex, rewardIndex });
      return {
        target: gauge.pool.id,
        params: [rewardIndex],
      };
    })
  );

  const rewardTokenResponses = (
    await sdk.api.abi.multiCall({
      calls: rewardTokenCalls,
      abi: gaugeABI.find((n) => n.name === 'reward_tokens'),
      chain: chainString,
      permitFailure: true,
    })
  ).output;

  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const rewardTokensByGauge = new Map();
  rewardTokenResponses.forEach((response, index) => {
    const { gaugeIndex, rewardIndex } = rewardTokenCallMeta[index];
    if (!rewardTokensByGauge.has(gaugeIndex)) {
      rewardTokensByGauge.set(gaugeIndex, Array(MAX_REWARD_TOKENS).fill(zeroAddress));
    }
    rewardTokensByGauge.get(gaugeIndex)[rewardIndex] = String(
      response.output || zeroAddress
    ).toLowerCase();
  });

  const rewardPairs = [];
  for (const [gaugeIndex, tokens] of rewardTokensByGauge.entries()) {
    for (const add of tokens) {
      if (add === zeroAddress) break;
      rewardPairs.push({ gaugeIndex, add });
    }
  }

  if (rewardPairs.length) {
    const rewardTokenKeys = [
      ...new Set(rewardPairs.map(({ add }) => `${chainString}:${add}`.toLowerCase())),
    ];
    const rewardPrices = {};
    const maxSize = 50;
    const pricePages = await Promise.all(
      [...Array(Math.ceil(rewardTokenKeys.length / maxSize)).keys()].map((p) => {
        const keys = rewardTokenKeys
          .slice(p * maxSize, maxSize * (p + 1))
          .join(',')
          .replaceAll('/', '');
        return utils.getPriceApiData(`/prices/current/${keys}`).then((r) => r.coins);
      })
    );
    pricePages.forEach((page) => Object.assign(rewardPrices, page));

    const rewardData = (
      await sdk.api.abi.multiCall({
        calls: rewardPairs.map(({ gaugeIndex, add }) => ({
          target: gauges[gaugeIndex].pool.id,
          params: [add],
        })),
        abi: gaugeABI.find((n) => n.name === 'reward_data'),
        chain: chainString,
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const totalSupplyGaugeIndexes = [
      ...new Set(rewardPairs.map(({ gaugeIndex }) => gaugeIndex)),
    ];
    const totalSupplies = (
      await sdk.api.abi.multiCall({
        calls: totalSupplyGaugeIndexes.map((gaugeIndex) => ({
          target: gauges[gaugeIndex].pool.id,
        })),
        abi: gaugeABI.find((n) => n.name === 'totalSupply'),
        chain: chainString,
        permitFailure: true,
      })
    ).output.map((o) => Number(o.output || 0) / 1e18);
    const totalSupplyByGauge = new Map(
      totalSupplyGaugeIndexes.map((gaugeIndex, index) => [
        gaugeIndex,
        totalSupplies[index],
      ])
    );

    const now = Date.now();
    rewardPairs.forEach(({ gaugeIndex, add }, index) => {
      const reward = rewardData[index];
      if (!reward || reward.period_finish * 1000 < now) return;

      const price = rewardPrices[`${chainString}:${add}`.toLowerCase()]?.price;
      const tokenPayable = (reward.rate / 1e18) * 7 * 86400;
      const totalSupply = totalSupplyByGauge.get(gaugeIndex);
      const weeklyRewards = (1 / (totalSupply + 1)) * tokenPayable;
      const yearlyRewards = weeklyRewards * 52 * price;
      const bptPrice = gauges[gaugeIndex].x.tvl / gauges[gaugeIndex].x.totalShares;
      const aprLM = (yearlyRewards / bptPrice) * 100;

      gauges[gaugeIndex].aprLMRewards.push(aprLM === Infinity ? null : aprLM);
      gauges[gaugeIndex].rewardTokens.push(add);
    });
  }

  gauges.forEach((gauge) => {
    gauge.x.aprLM = gauge.aprLMRewards
      .filter((i) => isFinite(i))
      .reduce((a, b) => a + b, 0);
    gauge.x.rewardTokens = gauge.rewardTokens;
  });

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

  const maxSize = 50;
  const pages = Math.ceil(tokenList.length / maxSize);
  let pricesA = [];
  let keys = '';
  for (const p of [...Array(pages).keys()]) {
    keys = tokenList
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `${chainString}:${i}`)
      .join(',')
      .replaceAll('/', '');
    pricesA = [
      ...pricesA,
      (await utils.getPriceApiData(`/prices/current/${keys}`)).coins,
    ];
  }
  let tokenPriceList = {};
  for (const p of pricesA) {
    tokenPriceList = { ...tokenPriceList, ...p };
  }

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
    const chainUrl =
      chainString === 'avax'
        ? 'avalanche'
        : chainString === 'xdai'
        ? 'gnosis'
        : chainString;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'balancer-v2',
      symbol: p.symbol,
      token: p.id.slice(0, 42).toLowerCase(),
      tvlUsd: p.tvl,
      apyBase: p.aprFee,
      apyReward:
        p.id ===
        '0x8167a1117691f39e05e9131cfa88f0e3a620e96700020000000000000000038c' // WETH-T wrong bal apr
          ? 0
          : p.aprLM,
      rewardTokens: p.rewardTokens,
      underlyingTokens: p.tokensList,
      url: `https://balancer.fi/pools/${chainUrl}/v2/${p.id}`,
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

  const data = await Promise.allSettled([
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
    topLvl(
      'xdai',
      urlGnosis,
      query,
      queryPrior,
      urlGaugesGnosis,
      queryGauge,
      gaugeABIGnosis,
      swapFeePercentage
    ),
    topLvl(
      'base',
      urlBaseChain,
      query,
      queryPrior,
      urlGaugesBase,
      queryGauge,
      gaugeABIBase,
      swapFeePercentage
    ),
    topLvl(
      'avax',
      urlAvalanche,
      query,
      queryPrior,
      urlGaugesAvalanche,
      queryGauge,
      gaugeABIArbitrum,
      swapFeePercentage
    ),
  ]);

  const pools = data
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(pools, 'balancer', (p) => p.pool.slice(0, 42));
};

module.exports = {
  protocolId: '2611',
  timetravel: false,
  apy: main,
};
