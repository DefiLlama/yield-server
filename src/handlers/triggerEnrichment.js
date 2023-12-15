const superagent = require('superagent');
const ss = require('simple-statistics');

const utils = require('../utils/s3');
const {
  getYieldFiltered,
  getYieldOffset,
  getYieldAvg30d,
  getYieldLendBorrow,
} = require('../queries/yield');
const { getStat } = require('../queries/stat');
const { welfordUpdate } = require('../utils/welford');
const poolsResponseColumns = require('../utils/enrichedColumns');

module.exports.handler = async (event, context) => {
  await main();
};

const main = async () => {
  console.log('START DATA ENRICHMENT');

  // ---------- get lastet unique pool
  console.log('\ngetting pools');
  let data = await getYieldFiltered();

  // remove aave v2 frozen assets from dataEnriched (we keep ingesting into db, but don't
  // want to display frozen pools on the UI)
  data = data.filter(
    (p) => !(p.project === 'aave-v2' && p.poolMeta === 'frozen')
  );

  // ---------- add additional fields
  // for each project we get 3 offsets (1D, 7D, 30D) and calculate absolute apy pct-change
  console.log('\nadding pct-change fields');
  const days = ['1', '7', '30'];
  let dataEnriched = [];
  const failed = [];

  for (const adaptor of [...new Set(data.map((p) => p.project))]) {
    // filter data to project
    const dataProject = data.filter((el) => el.project === adaptor);

    // api calls
    const promises = [];
    for (let i = 0; i < days.length; i++) {
      promises.push(getYieldOffset(adaptor, days[i]));
    }
    try {
      const offsets = await Promise.all(promises);
      // calculate pct change for each pool
      dataEnriched = [
        ...dataEnriched,
        ...dataProject.map((p) => enrich(p, days, offsets)),
      ];
    } catch (err) {
      console.log(err);
      failed.push(adaptor);
      console.log('defaulting to main data');
      dataEnriched = [
        ...dataEnriched,
        ...data.filter((el) => el.project === adaptor),
      ];
      continue;
    }
  }

  // add 30d avg apy
  const avgApy30d = await getYieldAvg30d();
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    apyMean30d: avgApy30d[p.configID] ?? null,
  }));

  // add info about stablecoin, exposure etc.
  console.log('\nadding additional pool info fields');
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets
    // removing any stable which a price 30% from 1usd
    .filter((s) => s.price >= 0.7)
    .map((s) => s.symbol.toLowerCase())
    .filter((s) => s !== 'r');
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');
  if (!stablecoins.includes('fraxbp')) stablecoins.push('fraxbp');
  if (!stablecoins.includes('usdr')) stablecoins.push('usdr');

  // get catgory data (we hardcode IL to true for options protocols)
  const config = (
    await superagent.get('https://api.llama.fi/config/yields?a=1')
  ).body.protocols;
  dataEnriched = dataEnriched.map((el) => addPoolInfo(el, stablecoins, config));

  // add ML and overview plot fields
  // expanding mean, expanding standard deviation,
  // geometric mean and standard deviation (of daily returns)
  console.log('\nadding stats columns');
  const T = 365;
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const dataStat = await getStat();
  const statColumns = welfordUpdate(dataEnriched, dataStat);
  // add columns to dataEnriched
  for (const p of dataEnriched) {
    const x = statColumns.find((i) => i.configID === p.configID);
    // create columns
    // a) ML section
    p['count'] = x.count;
    p['apyMeanExpanding'] = x.meanAPY;
    p['apyStdExpanding'] =
      x.count < 2 ? null : Math.sqrt(x.mean2APY / (x.count - 1));
    // b) scatterchart section
    p['mu'] = (x.productDR ** (T / x.count) - 1) * 100;
    p['sigma'] =
      x.count < 2 ? 0 : Math.sqrt((x.mean2DR / (x.count - 1)) * T) * 100;
  }
  // mark pools as outliers if outside boundary (let user filter via toggle on frontend)
  const columns = ['mu', 'sigma'];
  const outlierBoundaries = {};
  for (const col of columns) {
    // for quantile thr calculation we keep only finite values (discarding null, undefined, NaN, Infinity)
    const x = dataEnriched.map((p) => p[col]).filter((p) => Number.isFinite(p));
    const x_iqr = ss.quantile(x, 0.75) - ss.quantile(x, 0.25);
    const x_median = ss.median(x);
    const distance = 1.5;
    const x_lb = x_median - distance * x_iqr;
    const x_ub = x_median + distance * x_iqr;
    outlierBoundaries[col] = { lb: Math.max(0, x_lb), ub: x_ub };
  }
  // before adding the new outlier field,
  // i'm setting sigma to 0 instead of keeping it to null
  // so the label on the scatterchart makes more sense
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    mu: Number.isFinite(p.mu) ? p.mu : 0,
    sigma: Number.isFinite(p.sigma) ? p.sigma : 0,
  }));

  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    outlier:
      p['mu'] < outlierBoundaries['mu']['lb'] ||
      p['mu'] > outlierBoundaries['mu']['ub'] ||
      p['sigma'] < outlierBoundaries['sigma']['lb'] ||
      p['sigma'] > outlierBoundaries['sigma']['ub'],
  }));

  // add ML predictions
  console.log('\nadding apy runway prediction');
  // load categorical feature mappings
  const modelMappings = await utils.readFromS3(
    'llama-apy-prediction-prod',
    'mlmodelartefacts/categorical_feature_mapping_2022_05_20.json'
  );
  for (const el of dataEnriched) {
    project_fact = modelMappings.project_factorized[el.project];
    chain_fact = modelMappings.chain_factorized[el.chain];
    // in case of new project assign -1 to factorised variable indicated missing value
    // RF usually handles this quite well, of course if we get lots of new projects, will
    // need to retrain the algorithm
    el.project_factorized = project_fact === undefined ? -1 : project_fact;
    el.chain_factorized = chain_fact === undefined ? -1 : chain_fact;
  }

  // impute null values on apyStdExpanding (this will be null whenever we have pools with less than 2
  // samples, eg. whenever a new pool project is listed or an existing project adds new pools
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    apyStdExpanding: p.apyStdExpanding ?? 0,
  }));

  const y_pred = (
    await superagent
      .post(
        'https://yet9i1xlhf.execute-api.eu-central-1.amazonaws.com/predictions'
      )
      // filter to required features only
      .send(
        dataEnriched.map((el) => ({
          apy: el.apy,
          tvlUsd: el.tvlUsd,
          apyMeanExpanding: el.apyMeanExpanding,
          apyStdExpanding: el.apyStdExpanding,
          chain_factorized: el.chain_factorized,
          project_factorized: el.project_factorized,
        }))
      )
  ).body.predictions;
  // add predictions to dataEnriched
  if (dataEnriched.length !== y_pred.length) {
    throw new Error(
      'prediction array length does not match dataEnriched input shape!'
    );
  }
  // add predictions to dataEnriched
  for (const [i, el] of dataEnriched.entries()) {
    // for certain conditions we don't want to show predictions on the frontend
    // 1. apy === 0
    // 2. less than 7 datapoints per pool
    // (low confidence in the model predictions backward looking features (mean and std)
    // are undeveloped and might skew prediction results)

    // for frontend, encoding predicted labels
    const classEncoding = {
      0: 'Down',
      1: 'Stable/Up',
    };

    const nullifyPredictionsCond = el.apy <= 0 || el.count < 7;
    const cond = y_pred[i][0] >= y_pred[i][1];
    // (we add label + probabalilty of the class with the larger probability)
    const predictedClass = nullifyPredictionsCond
      ? null
      : cond
      ? classEncoding[0]
      : classEncoding[1];
    const predictedProbability = nullifyPredictionsCond
      ? null
      : cond
      ? y_pred[i][0] * 100
      : y_pred[i][1] * 100;

    el.predictions = {
      predictedClass,
      predictedProbability,
    };
  }

  // hardcode notional's fixed rate pools to stable + high confidence
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    predictions:
      p.project === 'notional' && p.poolMeta?.toLowerCase().includes('maturing')
        ? { predictedClass: 'Stable/Up', predictedProbability: 100 }
        : p.predictions,
  }));

  // based on discussion here: https://github.com/DefiLlama/yield-ml/issues/2
  // the output of a random forest predict_proba are smoothed relative frequencies of
  // of class distributions and do not represent calibrated probabilities
  // instead of showing this as is on the frontend,
  // it makes sense to a) either calibrate (which will take a bit more time and effort)
  // or to bin the scores into confidence values which i'm using here
  const predScores = dataEnriched
    .map((el) => el.predictions.predictedProbability)
    .filter((el) => el !== null);
  // bin into 3 equal groups using 33.3%, 66.6% and 100% quantile;
  // currently gives ~ [ 69, 84, 100 ] as cutoff values
  const quantilesScores = [0.333, 0.666, 1];
  const [q33, q66, q1] = ss.quantile(predScores, quantilesScores);
  for (const p of dataEnriched) {
    p.predictions.binnedConfidence =
      // we nullify binnedConfidence in case one of the above probability conditions in nullifyPredictionsCond
      // were true
      p.predictions.predictedProbability === null
        ? null
        : p.predictions.predictedProbability <= q33
        ? 1
        : p.predictions.predictedProbability <= q66
        ? 2
        : 3;
  }

  // round numbers
  const precision = 5;
  dataEnriched = dataEnriched.map((p) =>
    Object.fromEntries(
      Object.entries(p).map(([k, v]) => [
        k,
        typeof v === 'number' ? +v.toFixed(precision) : v,
      ])
    )
  );

  // before saving, we set pool = configID for the api response of /pools & /poolsEnriched
  // so we can have the same usage pattern on /chart without breaking changes
  dataEnriched = dataEnriched
    .map((p) => ({ ...p, pool_old: p.pool, pool: p.configID }))
    .map(({ configID, ...p }) => p);

  // overwrite triggerAdapter apy calc for abracadabra (some of their vaults apply interest on collateral
  // instead of borrowed mim) -> negative apyBase -> negative apy (we don't store negative apy values in db though
  // nor do we use neg values on feature calc cause might break some things)
  // hence the updated calc here to have correct nbs on UI
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    apy: p.project === 'abracadabra' ? p.apyBase + p.apyReward : p.apy,
  }));

  // ---------- save output to S3
  console.log('\nsaving data to S3');
  console.log('nb of pools', dataEnriched.length);
  const bucket = process.env.BUCKET_DATA;
  const key = 'enriched/dataEnriched.json';
  dataEnriched = dataEnriched.sort((a, b) => b.tvlUsd - a.tvlUsd);
  await utils.writeToS3(bucket, key, dataEnriched);

  // store ML predictions so we can keep track of model performance
  const f = 1000 * 60 * 60;
  const timestamp = new Date(Math.floor(Date.now() / f) * f).toISOString();

  if (timestamp.split('T')[1] === '23:00:00.000Z') {
    const keyPredictions = `predictions-hourly/dataEnriched_${timestamp}.json`;
    await utils.writeToS3(bucket, keyPredictions, dataEnriched);
  }

  // we cp dataEnriched (but remove unecessary columns) to our public s3 bucket
  // which is used as source for /pools
  const pools = dataEnriched.map((p) => {
    const newPool = {};
    poolsResponseColumns.forEach((col) => (newPool[col] = p[col]));
    return newPool;
  });

  await utils.storeAPIResponse('defillama-datasets', 'yield-api/pools', {
    status: 'success',
    data: pools,
  });

  // query db for lendBorrow and store to s3 as origin for cloudfront
  await utils.storeAPIResponse(
    'defillama-datasets',
    'yield-api/lendBorrow',
    await getYieldLendBorrow()
  );
};

////// helper functions
// calculate absolute change btw current apy and offset value
const enrich = (pool, days, offsets) => {
  const poolC = { ...pool };
  for (let d = 0; d < days.length; d++) {
    let X = offsets[d];
    const apyOffset = X.find((x) => x.configID === poolC.configID)?.apy;
    poolC[`apyPct${days[d]}D`] = poolC['apy'] - apyOffset;
  }
  return poolC;
};

const checkStablecoin = (el, stablecoins) => {
  let tokens = el.symbol.split('-').map((el) => el.toLowerCase());
  const symbolLC = el.symbol.toLowerCase();

  let stable;
  if (
    el.project === 'curve' &&
    symbolLC.includes('3crv') &&
    !symbolLC.includes('btc')
  ) {
    stable = true;
  } else if (el.project === 'convex-finance' && symbolLC.includes('3crv')) {
    stable = true;
  } else if (el.project === 'aave-v2' && symbolLC.includes('amm')) {
    tok = tokens[0].split('weth');
    stable = tok[0].includes('wbtc') ? false : tok.length > 1 ? false : true;
  } else if (tokens[0].includes('torn')) {
    stable = false;
  } else if (el.project === 'hermes-protocol' && symbolLC.includes('maia')) {
    stable = false;
  } else if (el.project === 'sideshift' && symbolLC.includes('xai')) {
    stable = false;
  } else if (el.project === 'archimedes-finance' && symbolLC.includes('usd')) {
    stable = true;
  } else if (
    el.project === 'aura' &&
    [
      '0xa13a9247ea42d743238089903570127dda72fe44',
      '0x99c88ad7dc566616548adde8ed3effa730eb6c34',
      '0xf3aeb3abba741f0eece8a1b1d2f11b85899951cb',
    ].includes(el.pool)
  ) {
    stable = true;
  } else if (
    tokens.some((t) => t.includes('sushi')) ||
    tokens.some((t) => t.includes('dusk')) ||
    tokens.some((t) => t.includes('fpis')) ||
    tokens.some((t) => t.includes('emaid')) ||
    tokens.some((t) => t.includes('grail')) ||
    tokens.some((t) => t.includes('oxai')) ||
    tokens.some((t) => t.includes('crv'))
  ) {
    stable = false;
  } else if (tokens.length === 1) {
    stable = stablecoins.some((x) =>
      tokens[0].replace(/\s*\(.*?\)\s*/g, '').includes(x)
    );
  } else if (tokens.length > 1) {
    let x = 0;
    for (const t of tokens) {
      x += stablecoins.some((x) => t.includes(x));
    }
    stable = x === tokens.length ? true : false;
  }

  return stable;
};

// no IL in case of:
// 1: - stablecoin
// 2: - 1 asset
// 3: - more than 1 asset but same underlying assets
const checkIlRisk = (el) => {
  const l1Token = ['btc', 'eth', 'avax', 'matic', 'eur', 'link', 'sushi'];
  const symbol = el.symbol.toLowerCase();
  const tokens = symbol.split('-');

  ilRisk = '';
  if (
    symbol.includes('cvxcrv') ||
    symbol.includes('ammuni') ||
    symbol.includes('ammbpt') ||
    symbol.includes('tricrypto') ||
    symbol.includes('3crypto')
  ) {
    ilRisk = 'yes';
  } else if (tokens.length === 1) {
    ilRisk = 'no';
  } else {
    const elements = [];
    for (const t of tokens) {
      for (const x of l1Token) {
        if (t.includes(x)) {
          elements.push(x);
          break;
        }
      }
    }
    // the length of elements need to be the same as length of tokens, otherwise the below
    // check will fail in certain cases
    if (elements.length === 0) {
      elements.push(tokens);
    } else if (tokens.length > elements.length) {
      elements.push('placeholder');
    }

    ilRisk = [...new Set(elements.flat())].length > 1 ? 'yes' : 'no';
  }

  return ilRisk;
};

const checkExposure = (el) => {
  // generic
  let exposure = el.symbol.includes('-') ? 'multi' : 'single';

  // generic 3crv check
  if (exposure === 'single' && el.symbol.toLowerCase().includes('3crv'))
    return 'multi';

  // project specific
  if (el.project === 'aave') {
    exposure =
      el.symbol.toLowerCase().includes('ammuni') ||
      el.symbol.toLowerCase().includes('ammbpt')
        ? 'multi'
        : exposure;
  } else if (el.project === 'badger-dao') {
    exposure = el.symbol.toLowerCase().includes('crv') ? 'multi' : exposure;
  } else if (el.project === 'dot-dot-finance') {
    exposure = 'multi';
  } else if (el.project === 'synapse') {
    exposure = 'multi';
  }

  return exposure;
};

const addPoolInfo = (el, stablecoins, config) => {
  el['stablecoin'] = checkStablecoin(el, stablecoins);

  // complifi has single token exposure only cause the protocol
  // will pay traders via deposited amounts
  el['ilRisk'] =
    el.pool === '0x13C6Bed5Aa16823Aba5bBA691CAeC63788b19D9d' // jones-dao jusdc pool
      ? 'no'
      : config[el.project]?.category === 'Options'
      ? 'yes'
      : [
          'complifi',
          'optyfi',
          'arbor-finance',
          'opyn-squeeth',
          'gmd-protocol',
          'y2k-v1',
          'y2k-v2',
          'o3-swap',
          'solv-funds',
        ].includes(el.project)
      ? 'yes'
      : ['mycelium-perpetual-swaps', 'gmx', 'rage-trade'].includes(
          el.project
        ) && ['mlp', 'glp'].includes(el.symbol.toLowerCase())
      ? 'yes'
      : el.stablecoin && el.symbol.toLowerCase().includes('eur')
      ? checkIlRisk(el)
      : el.stablecoin
      ? 'no'
      : checkIlRisk(el);
  el['exposure'] = checkExposure(el);

  return el;
};

module.exports.checkStablecoin = checkStablecoin;
