const utils = require('../utils');
const pools = require('./pools');

// comes from different locations, merging func
const mergeBaseApy = async () => {
  // this is the base apy data, split up into 2 different json files
  let dataBaseApy = await utils.getData(
    'https://stats.curve.fi/raw-stats/apys.json'
  );
  dataBaseApy = dataBaseApy.apy.day;

  let dataBaseApyOther = await utils.getData(
    'https://stats.curve.fi/raw-stats-crypto/apys.json'
  );
  dataBaseApyOther = dataBaseApyOther.apy.week;

  const keys = Object.keys(dataBaseApyOther);

  for (const i of keys) {
    dataBaseApy[i] = dataBaseApyOther[i];
  }

  return [dataBaseApy, keys];
};

const getDataEth = async () => {
  const poolStats = [];

  // 1) get price data
  const pricesUSD = await utils.getCGpriceData(
    'ethereum,bitcoin,chainlink,stasis-eurs',
    true
  );

  // 2) get complete base apy data (this does not include any of the factory pool data...)
  const [dataBaseApy, keysExtra] = await mergeBaseApy();

  // 3) pull curve pool stats data and prepare the individual pool data
  for (const [pool, apy] of Object.entries(dataBaseApy)) {
    // there are few pools in the data which are actually not
    // displayed on the frontend, I remove them
    // here, probably not the best idea hardcoding this...
    if ('rens,linkusd,idle'.includes(pool)) {
      continue;
    }

    if (keysExtra.includes(pool)) {
      url = `https://stats.curve.fi/raw-stats-crypto/${pool}-1440m.json`;
    } else {
      url = `https://stats.curve.fi/raw-stats/${pool}-1440m.json`;
    }
    let poolData = await utils.getData(url);
    const maxTimestamp = Math.max(...poolData.map((el) => el.timestamp), 0);
    poolData = poolData.find((el) => el.timestamp === maxTimestamp);

    // the price will be different depending on pool type
    // usd pools are 1, btc pools need to be multiplied by the btc price etc
    // cause total supply is in the native unit, like balance
    if (pool.includes('eth')) {
      price = pricesUSD.ethereum.usd;
    } else if (pool.includes('btc')) {
      price = pricesUSD.bitcoin.usd;
    } else if (pool.includes('link')) {
      price = pricesUSD.chainlink.usd;
    } else if (pool.includes('eur')) {
      price = pricesUSD['stasis-eurs'].usd;
    } else {
      price = 1;
    }

    // for tricrypto pools i use the balances and prices cause
    // supply cant just be multiplied by a single price
    const scalingFactor = 1e18;
    poolData.virtual_price /= scalingFactor;
    poolData.supply /= scalingFactor;

    if (keysExtra.includes(pool)) {
      if (pool.includes('tricrypto')) {
        decimals = [1e6, 1e8, 1e18]; // usdt, btc, eth
      } else if (pool.includes('eurtusd')) {
        decimals = [1e6, 1e18];
      } else if (pool.includes('eursusd')) {
        decimals = [1e6, 1e2];
      } else if (pool.includes('crveth')) {
        decimals = [1e18, 1e18];
      } else if (pool.includes('cvxeth')) {
        decimals = [1e18, 1e18];
      } else if (pool.includes('xautusd')) {
        decimals = [1e6, 1e18];
      } else if (pool.includes('spelleth')) {
        decimals = [1e18, 1e18];
      } else if (pool.includes('teth')) {
        decimals = [1e18, 1e18];
      }

      if (pool === 'eurtusd') {
        tvl = (poolData.balances[0] / decimals[0]) * poolData.price_scale;
        tvl += poolData.balances[1] / decimals[1];
      } else if (pool === 'eursusd') {
        tvl = (poolData.balances[0] / decimals[0]) * poolData.price_scale;
        tvl += poolData.balances[1] / decimals[1];
      } else if (pool === 'xautusd') {
        tvl = (poolData.balances[0] / decimals[0]) * poolData.price_scale;
        tvl += poolData.balances[1] / decimals[1];
      } else {
        tvl = 0;
        poolData.balances.forEach((el, i) => {
          tvl += (el / decimals[i]) * poolData.crypto_prices[i];
        });
      }
    } else {
      // for all else
      tvl = poolData.supply * price;
    }

    // scale by virtual price
    tvl *= poolData.virtual_price;

    let apyBase = apy * 100;
    // some of the values are negative, set to 0
    apyBase = apyBase < 0 ? 0 : apyBase;

    // 4) get crv+reward apr data
    let dataCrvApy = await utils.getData(
      'https://www.convexfinance.com/api/curve-apys'
    );
    let dataRewardApy = await utils.getData('https://api.curve.fi/api/getApys');
    dataCrvApy = dataCrvApy.apys;
    dataRewardApy = dataRewardApy.data;

    // unfort these two endpoints have different keys for some pools
    let searchKey = pool;
    if (pool === 'y') {
      searchKey = 'iearn';
    } else if (pool === 'susd') {
      searchKey = 'susdv2';
    } else if (pool === 'ren2') {
      searchKey = 'ren';
    }

    const apyCrv = dataCrvApy[searchKey]?.crvApy;

    // need to sum up the potential rewards apys
    const apyRewardsArray = dataRewardApy[searchKey]?.additionalRewards;
    let apyRewardsSum = 0;
    if (apyRewardsArray?.length > 0) {
      apyRewardsSum = apyRewardsArray
        .map((el) => el.apy)
        .reduce((accumulator, curr) => accumulator + curr);
    }
    const apySum =
      apyRewardsSum === undefined
        ? apyBase + apyCrv
        : apyBase + apyCrv + apyRewardsSum;

    // 6) append output to object
    poolStats.push({
      pool,
      virtual_price: poolData.virtual_price,
      totalSupply: poolData.supply,
      tvl,
      apyBase,
      apyCrv,
      apyRewardsArray,
      apyRewardsSum,
      apy: apySum,
    });
  }

  // note(temporary only, investiage 4pool and 2pool apy)
  return poolStats.filter((el) => el.pool !== '4pool' && el.pool !== '2pool');
};

const getDataEVM = async (chainString) => {
  let tvl = await utils.getData(
    `https://api.curve.fi/api/getTVL${
      chainString.charAt(0).toUpperCase() + chainString.slice(1)
    }`
  );
  tvl = tvl.data.pools;

  const poolNames = Object.keys(tvl);
  let dataTvl = [];
  for (const p of poolNames) {
    const obj = tvl[p];
    obj['pool'] = p;
    dataTvl.push(obj);
  }

  if (chainString === 'fantom') {
    dataApy = await utils.getData(
      `https://stats.curve.fi/raw-stats-ftm/apys.json`
    );
  } else {
    dataApy = await utils.getData(
      `https://stats.curve.fi/raw-stats-${chainString}/apys.json`
    );
  }
  for (const el of dataTvl) {
    el.apy = dataApy.apy.day[el.pool];
  }

  dataTvl = dataTvl.filter((el) =>
    Object.keys(pools.tokenMapping[chainString]).includes(el.pool)
  );

  return dataTvl;
};

const buildPool = (entry, chainString) => {
  const token = pools.tokenMapping[chainString][entry.pool];
  const id = pools.pools[chainString].find(
    (el) => el.name === entry.pool
  )?.swap;
  let apy = entry.apy < 0 ? 0 : entry.apy;
  apy = chainString === 'ethereum' ? apy : apy * 100;

  const newObj = {
    // ugly, but some swap pools have same address on diff networks
    pool: `${id}-${chainString}`,
    chain: utils.formatChain(chainString),
    project: 'curve',
    symbol: utils.formatSymbol(token),
    tvlUsd: entry.tvl,
    apy: apy,
  };
  return newObj;
};

const topLvl = async (chainString) => {
  if (chainString === 'ethereum') {
    // pull data
    poolStats = await getDataEth();
  } else {
    // pull data
    poolStats = await getDataEVM(chainString);
  }
  // build pool objects
  let data = poolStats.map((el) => {
    if (pools.tokenMapping[chainString][el.pool] === undefined) {
      return null;
    }
    return buildPool(el, chainString);
  });

  data = data.filter((el) => el !== null);
  return data;
};

const main = async () => {
  let data = await Promise.all([
    topLvl('ethereum'),
    topLvl('arbitrum'),
    topLvl('avalanche'),
    topLvl('fantom'),
    topLvl('harmony'),
    topLvl('optimism'),
    topLvl('polygon'),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  curvePoolStats: getDataEth,
  tokenMapping: pools.tokenMapping['ethereum'],
};
