const { request, gql } = require('graphql-request');
const Web3 = require('web3');
const utils = require('../utils');
const gaugeABIEthereum = require('./abis/gauge_ethereum.json');
const gaugeABIArbitrum = require('./abis/gauge_arbitrum.json');
const gaugeABIPolygon = require('./abis/gauge_polygon.json');
const gaugeControllerEthereum = require('./abis/gauge_controller_ethereum.json');
const protocolFeesCollectorABI = require('./abis/protocol_fees_collector.json');

// Subgraph URLs
const urlBase = 'https://api.thegraph.com/subgraphs/name/balancer-labs';
const urlEthereum = `${urlBase}/balancer-v2`;
const urlPolygon = `${urlBase}/balancer-polygon-v2`;
const urlArbitrum = `${urlBase}/balancer-arbitrum-v2`;

const urlGaugesEthereum = `${urlBase}/balancer-gauges`;
const urlGaugesPolygon = `${urlBase}/balancer-gauges-polygon`;
const urlGaugesArbitrum = `${urlBase}/balancer-gauges-arbitrum`;

const protocolFeesCollector = '0xce88686553686DA562CE7Cea497CE749DA109f9F';

const queryGauge = gql`
  {
    liquidityGauges(first: 999) {
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
      first: 1000
      orderBy: "totalLiquidity"
      orderDirection: "desc"
      where: { totalShares_gt: 0.01 }
      skip: 0
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

// coingecko chain mapping
const networkMappingCG = {
  ethereum: 'ethereum',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
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

const tvl = (entry, tokenPriceList) => {
  entry = { ...entry };

  const balanceDetails = entry.tokens;
  const d = {
    id: entry.id,
    symbol: balanceDetails.map((tok) => tok.symbol).join('-'),
    tvl: 0,
  };
  for (const el of balanceDetails) {
    // some addresses are from tokens which are not listed on coingecko so these will result in undefined
    const price = tokenPriceList[el.address]?.usd;
    // if price is undefined of one token in pool, the total tvl will be NaN
    d.tvl += Number(el.balance) * price;
  }

  return d;
};

const aprLM = async (tvlData, urlLM, queryLM, chainString, gaugeABI) => {
  // copy
  const data = tvlData.map((a) => ({ ...a }));

  // get liquidity gauges for each pool
  const { liquidityGauges } = await request(urlLM, queryLM);

  // web 3 connection
  if (chainString === 'ethereum') {
    conn = process.env.INFURA_CONNECTION;
  } else if (chainString === 'arbitrum') {
    conn = process.env.ALCHEMY_CONNECTION_ARBITRUM;
  } else if (chainString === 'polygon') {
    conn = process.env.ALCHEMY_CONNECTION_POLYGON;
  }
  const web3 = new Web3(conn);

  // get BAL inflation rate (constant among gauge contract ids)
  if (chainString === 'ethereum') {
    const gaugeContract = new web3.eth.Contract(
      gaugeABI,
      liquidityGauges[0].id
    );
    inflationRate =
      (await gaugeContract.methods.inflation_rate().call()) / 1e18;

    const gaugeController = '0xC128468b7Ce63eA702C1f104D55A2566b13D3ABD';
    gaugeControllerContract = new web3.eth.Contract(
      gaugeControllerEthereum,
      gaugeController
    );

    // get BAL price
    balToken = '0xba100000625a3754423978a60c9317c58a424e3d';

    // get cg price of reward token
    prices = await utils.getCGpriceData(
      balToken,
      false,
      networkMappingCG[chainString]
    );
  }

  // add LM rewards if available to each pool in data
  for (const pool of liquidityGauges) {
    const x = data.find((el) => el.id === pool.poolId);
    if (x === undefined) {
      continue;
    }

    // connect to specific gauge contract
    const gauge = new web3.eth.Contract(gaugeABI, pool.id);

    const aprLMRewards = [];

    if (chainString === 'ethereum') {
      // get relative weight (of base BAL token rewards for a pool)
      const relativeWeight =
        (await gaugeControllerContract.methods
          .gauge_relative_weight(pool.id)
          .call()) / 1e18;

      // for base BAL rewards
      if (relativeWeight !== 0) {
        const totalSupply = (await gauge.methods.totalSupply().call()) / 1e18;
        const workingSupply =
          (await gauge.methods.working_supply().call()) / 1e18;
        // bpt == balancer pool token
        const bptPrice = x.tvl / totalSupply;
        const balPayable = inflationRate * 7 * 86400 * relativeWeight;
        const weeklyReward = (0.4 / (workingSupply + 0.4)) * balPayable;
        const yearlyReward = weeklyReward * 52 * prices[balToken].usd;
        const aprLM = (yearlyReward / bptPrice) * 100;
        aprLMRewards.push(aprLM === Infinity ? 0 : aprLM);
      }
    }

    // first need to find the reward token
    // (balancer UI loops up to 8times, will replicate the same logic)
    const MAX_REWARD_TOKENS = 8;
    for (let i = 0; i < MAX_REWARD_TOKENS; i++) {
      // get token reward address
      const add = (await gauge.methods.reward_tokens(i).call()).toLowerCase();
      if (add === '0x0000000000000000000000000000000000000000') {
        break;
      }

      // get cg price of reward token
      const prices = await utils.getCGpriceData(
        add,
        false,
        networkMappingCG[chainString]
      );

      // call reward data
      const { rate } = await gauge.methods.reward_data(add).call();
      const inflationRate = rate / 1e18;
      const tokenPayable = inflationRate * 7 * 86400;
      const totalSupply = (await gauge.methods.totalSupply().call()) / 1e18;

      const weeklyRewards = (1 / (totalSupply + 1)) * tokenPayable;
      const yearlyRewards = weeklyRewards * 52 * prices[add].usd;
      const bptPrice = x.tvl / totalSupply;
      const aprLM = (yearlyRewards / bptPrice) * 100;

      aprLMRewards.push(aprLM === Infinity ? null : aprLM);
    }

    // add up individual LM rewards
    x.aprLM = aprLMRewards
      .filter((i) => isFinite(i))
      .reduce((a, b) => a + b, 0);
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

const buildPool = (el, chainString) => {
  const newObj = {
    pool: el.id,
    chain: utils.formatChain(chainString),
    project: 'balancer',
    symbol: utils.formatSymbol(el.symbol),
    tvlUsd: el.tvl,
    apy: el.aprFee + (el?.aprLM ?? 0),
  };

  return newObj;
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

  // get unique tokenList (addresses)(for which we pull prices from cg)
  const tokenList = [
    ...new Set(
      dataNow
        .map((el) => el.tokens)
        .flat()
        .map((el) => el.address)
    ),
  ];

  // NOTE(!) had to split the list cause i was getting errors on full list
  // guess because of too many token
  const idxSplitter = Math.floor(tokenList.length / 2);
  const tokenListP1 = tokenList.splice(0, idxSplitter);
  const tokenListP2 = tokenList.splice(idxSplitter);

  // pull prices from coingecko
  const tokenPriceList1 = await utils.getCGpriceData(
    tokenListP1.join(),
    false,
    networkMappingCG[chainString]
  );
  const tokenPriceList2 = await utils.getCGpriceData(
    tokenListP2.join(),
    false,
    networkMappingCG[chainString]
  );

  const tokenPriceList = { ...tokenPriceList1, ...tokenPriceList2 };

  // calculate tvl
  let tvlInfo = dataNow.map((el) => tvl(el, tokenPriceList));

  // calculate fee apy
  tvlInfo = tvlInfo.map((el) =>
    aprFee(el, dataNow, dataPrior, swapFeePercentage)
  );

  // calculate reward apr
  tvlInfo = await aprLM(tvlInfo, urlGauge, queryGauge, chainString, gaugeABI);

  // build pool objects
  let data = tvlInfo.map((el) => buildPool(el, chainString));

  // remove samples for which apy is NaN (usually the case if tvl is Nan, because of no price from CG)
  data = data.filter((el) => Number.isNaN(el.apy) !== true);

  return data;
};

const main = async () => {
  // balancer splits off a pct cut of swap fees to the protocol, get pct value:
  conn = process.env.INFURA_CONNECTION;
  const web3 = new Web3(conn);

  const feeCollectorContract = new web3.eth.Contract(
    protocolFeesCollectorABI,
    protocolFeesCollector
  );
  const swapFeePercentage =
    (await feeCollectorContract.methods.getSwapFeePercentage().call()) / 1e18;

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

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
