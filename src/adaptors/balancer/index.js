const { request, gql } = require('graphql-request');
const fetch = require('node-fetch');

const utils = require('../utils');

const urlLM =
  'https://raw.githubusercontent.com/balancer-labs/frontend-v2/master/src/lib/utils/liquidityMining/MultiTokenLiquidityMining.json';
const urlBase = 'https://api.thegraph.com/subgraphs/name/balancer-labs';
const urlEthereum = `${urlBase}/balancer-v2`;
const urlPolygon = `${urlBase}/balancer-polygon-v2`;
const urlArbitrum = `${urlBase}/balancer-arbitrum-v2`;

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

const prepareLMData = async () => {
  let dataLm = await fetch(urlLM);
  dataLm = await dataLm.json();

  const latestWeekId = Object.keys(dataLm).slice(-1);
  // this contains both info for ethereum (chain id 1) and polygon (chain id 137)
  dataLm = dataLm[latestWeekId];

  let rewardAddressesEth = [];
  let rewardAddressesPoly = [];
  let rewardAddressesArbi = [];

  for (const obj of dataLm) {
    // i hardcode this, mainly because I'm afraid they might add anew L2 and things will break
    if (obj.chainId !== 1 && obj.chainId !== 137 && obj.chainId !== 42161) {
      break;
    }
    const poolData = obj.pools;

    Object.keys(poolData).forEach((pool) => {
      a = poolData[pool].map((x) => x.tokenAddress);
      if (obj.chainId === 1) {
        rewardAddressesEth.push(a);
      } else if (obj.chainId === 137) {
        rewardAddressesPoly.push(a);
      } else if (obj.chainId === 42161) {
        rewardAddressesArbi.push(a);
      }
    });
  }

  rewardAddressesEth = [...new Set(rewardAddressesEth)].join();
  rewardAddressesPoly = [...new Set(rewardAddressesPoly)].join();
  rewardAddressesArbi = [...new Set(rewardAddressesArbi)].join();
  // get the coingecko price data for each unique reward token address
  const pricesEthereum = await utils.getCGpriceData(rewardAddressesEth);
  const pricesPolygon = await utils.getCGpriceData(
    rewardAddressesPoly,
    false,
    'polygon-pos'
  );
  const pricesArbitrum = await utils.getCGpriceData(
    rewardAddressesArbi,
    false,
    'arbitrum-one'
  );
  // concat
  const prices = { ...pricesEthereum, ...pricesPolygon, ...pricesArbitrum };

  // we no longer need the chainId, so I remove that
  let lmRewards = dataLm.map((el) => el.pools);
  // and flatten the content (from array of objects into 1 object)
  lmRewards = Object.assign(...lmRewards);

  const incentivsedPools = Object.keys(lmRewards);
  const lmYearlyRewardsUsdArray = [];
  for (const poolAdr of incentivsedPools) {
    let amountWeek = lmRewards[poolAdr].map(
      (el) => el.amount * prices[el.tokenAddress.toLowerCase()]?.usd
    );
    // in case no cg price, the map will be amount * undefined -> NaN, and reduce would be NaN as well
    // instead i remove the NaN elements from amountWeek array. useful in case there are 2 reward token for a pool
    // where cg returns 1 price but not the other (so at least we count the 1 token rewards), without removing we would
    // get NaN only
    amountWeek = amountWeek
      .filter((el) => !isNaN(el))
      .reduce((a, b) => a + b, 0);

    const amountYear = amountWeek * 52;
    lmYearlyRewardsUsdArray.push({
      id: poolAdr,
      lmYearlyRewardsUsd: amountYear,
    });
  }
  return lmYearlyRewardsUsdArray;
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

const apy = (el, dataNow, dataPrior, dataLM, chainString) => {
  const swapFeeNow = dataNow.find((x) => x.id === el.id)?.totalSwapFee;
  const swapFeePrior = dataPrior.find((x) => x.id === el.id)?.totalSwapFee;
  const swapFee24h = Number(swapFeeNow) - Number(swapFeePrior);
  const lmRewards = dataLM.find(
    (element) => element.id === el.id
  )?.lmYearlyRewardsUsd;

  el.swapFee24h = swapFee24h;
  // in case there no LM reward for a pool (not all of them receive rewards) we set the value to 0
  // so we dont end up with issues when summing up values for total apy
  el.lmYearlyRewardsUsd = lmRewards === undefined ? 0 : lmRewards;

  // add network
  el.network = chainString;

  el.apyFee = ((el.swapFee24h * 365) / el.tvl) * 100;
  el.apyLM = (el.lmYearlyRewardsUsd / el.tvl) * 100;

  return el;
};

const buildPool = (el, chainString) => {
  const apyFee = ((el.swapFee24h * 365) / el.tvl) * 100;
  const apyLM = (el.lmYearlyRewardsUsd / el.tvl) * 100;

  const newObj = {
    pool: el.id,
    chain: utils.formatChain(chainString),
    project: 'balancer',
    symbol: utils.formatSymbol(el.symbol),
    tvlUsd: el.tvl,
    apy: apyFee + apyLM,
  };

  return newObj;
};

const topLvl = async (chainString, url, dataLM) => {
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

  const networkMappingCC = {
    ethereum: 'ethereum',
    polygon: 'polygon-pos',
    arbitrum: 'arbitrum-one',
  };

  // pull prices from coingecko
  const tokenPriceList1 = await utils.getCGpriceData(
    tokenListP1.join(),
    false,
    networkMappingCC[chainString]
  );
  const tokenPriceList2 = await utils.getCGpriceData(
    tokenListP2.join(),
    false,
    networkMappingCC[chainString]
  );

  const tokenPriceList = { ...tokenPriceList1, ...tokenPriceList2 };

  // calculate tvl
  let tvlInfo = dataNow.map((el) => tvl(el, tokenPriceList));

  // calculate apy
  tvlInfo = tvlInfo.map((el) =>
    apy(el, dataNow, dataPrior, dataLM, chainString)
  );

  // build pool objects
  let data = tvlInfo.map((el) => buildPool(el, chainString));

  // remove samples for which apy is NaN (usually the case if tvl is Nan, because of no price from CG)
  data = data.filter((el) => Number.isNaN(el.apy) !== true);

  return data;
};

const main = async () => {
  // note(!) since week 98 no rewards in the above LM reward file for ethereum...
  const dataLM = await prepareLMData();
  const data = await Promise.all([
    topLvl('ethereum', urlEthereum, dataLM),
    topLvl('polygon', urlPolygon, dataLM),
    topLvl('arbitrum', urlArbitrum, dataLM),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
