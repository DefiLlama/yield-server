const superagent = require('superagent');
const ss = require('simple-statistics');

const utils = require('../utils/s3');
const adaptorsToExclude = require('../utils/exclude');
const { buildPoolsEnriched } = require('./getPoolsEnriched');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log(`START DATA ENRICHMENT at ${new Date()}`);

  const urlBase = process.env.APIG_URL;
  console.log('\n1. pulling base data...');
  let data = (await superagent.get(`${urlBase}/simplePools`)).body.data;
  // remove everything in adaptorsToExclude
  data = data.filter((p) => !adaptorsToExclude.includes(p.project));

  // for each project we get 3 offsets (1D, 7D, 30D) and calculate absolute apy pct-change
  console.log('\n2. adding pct-change fields...');
  const days = ['1', '7', '30'];
  let dataEnriched = [];
  const failed = [];

  for (const adaptor of [...new Set(data.map((p) => p.project))]) {
    console.log(adaptor);

    // filter data to project
    const dataProject = data.filter((el) => el.project === adaptor);

    // api calls
    const promises = [];
    for (let i = 0; i < days.length; i++) {
      promises.push(superagent.get(`${urlBase}/offsets/${adaptor}/${days[i]}`));
    }
    try {
      const offsets = await Promise.all(promises);
      // calculate pct change for each pool
      dataEnriched = [
        ...dataEnriched,
        ...dataProject.map((pool) => enrich(pool, days, offsets)),
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

  console.log('Nb of pools: ', dataEnriched.length);
  console.log(
    `Nb of failed adaptor offset calculations: ${failed.length}, List of failed adaptors: ${failed}`
  );

  // remove pools which have extreme values of TVL and/or APY
  // note(!) this could be more sophisticated via learned quantiles
  // but keeping it simple here and applying some basic thrs
  console.log('\n3. checking for apy null values and outliers');
  const UBApy = 1e6;
  const UBTvl = 2e10;
  outliers = dataEnriched.filter((el) => el.apy > UBApy && el.tvlUsd > UBTvl);
  console.log(`Found and removing ${outliers.length} pools from dataEnriched`);
  dataEnriched = dataEnriched.filter(
    (el) =>
      el.apy !== null &&
      el.apy <= UBApy &&
      el.tvlUsd <= UBTvl &&
      el.pool !== '0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d'
  );

  console.log('\n4. adding additional pool info fields');
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  dataEnriched = dataEnriched.map((el) => addPoolInfo(el, stablecoins));
  // complifi has single token exposure only, but IL can still occur if a trader makes a big one, in which
  // case the protocol will pay traders via deposited amounts...
  // so hardcoding this here as IL
  for (const p of dataEnriched) {
    if (p.project === 'complifi') {
      p.ilRisk = 'yes';
    }
  }

  // expanding mean, expanding standard deviation,
  // geometric mean and standard deviation (of daily returns)
  console.log('\n5. adding stats columns');
  const T = 365;
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const dataStats = (await superagent.get(`${urlBase}/stats`)).body.data;

  for (const p of dataEnriched) {
    d = dataStats.find((i) => i.pool === p.pool);

    if (d !== undefined) {
      // extract
      count = d.count;
      meanAPY = d.meanAPY;
      mean2APY = d.mean2APY;
      meanDR = d.meanDR;
      mean2DR = d.mean2DR;
      productDR = d.productDR;

      // update using welford algo
      count += 1;
      // a) ML section
      deltaAPY = p.apy - meanAPY;
      meanAPY += deltaAPY / count;
      delta2APY = p.apy - meanAPY;
      mean2APY += deltaAPY * delta2AY;
      // b) scatterchart section
      deltaDR = p.return - meanDR;
      meanDR += deltaDR / count;
      delta2 = p.return - meanDR;
      mean2DR += deltaDR * delta2DR;
      productDR = (1 + p.return) * productDR;
    } else {
      // in case of a new pool -> use default values
      count = 1;
      // a) ML section
      meanAPY = p.apy;
      mean2APY = 0;
      // b) scatterchart section
      mean2DR = 0;
      productDR = 1 + p.return;
    }

    // create columns
    // a) ML section
    el['count'] = count;
    el['apyMeanExpanding'] = meanAPY;
    el['apyStdExpanding'] =
      d === undefined || count < 2 ? null : Math.sqrt(mean2APY / (count - 1));

    // b) scatterchart section
    el['mu'] = (productDR ** (T / count) - 1) * 100;
    el['sigma'] = Math.sqrt((mean2DR / (count - 1)) * T) * 100;
  }
  // mark pools as outliers if outside boundary (let user filter via toggle on frontend)
  const columns = ['mu', 'sigma'];
  const outlierBoundaries = {};
  for (const col of columns) {
    let x = dataEnriched
      .map((p) => p[col])
      .filter((p) => p !== undefined && p !== null);
    const x_iqr = ss.quantile(x, 0.75) - ss.quantile(x, 0.25);
    const x_median = ss.median(x);
    const x_lb = x_median - 1.5 * x_iqr;
    const x_ub = x_median + 1.5 * x_iqr;
    outlierBoundaries[col] = { lb: x_lb, ub: x_ub };
  }
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    outlier:
      p['mu'] < outlierBoundaries['mu']['lb'] ||
      p['mu'] > outlierBoundaries['mu']['ub'] ||
      p['sigma'] < outlierBoundaries['sigma']['lb'] ||
      p['sigma'] > outlierBoundaries['sigma']['ub'],
  }));

  console.log('\n6. adding apy runway prediction');
  // load categorical feature mappings
  const modelMappings = await utils.readFromS3(
    'llama-apy-prediction-prod',
    'mlmodelartefacts/categorical_feature_mapping_2022_05_20.json'
  );
  console.log(modelMappings);
  for (const el of dataEnriched) {
    project_fact = modelMappings.project_factorized[el.project];
    chain_fact = modelMappings.chain_factorized[el.chain];
    // in case of new project assign -1 to factorised variable indicated missing value
    // RF usually handles this quite well, of course if we get lots of new projects, will
    // need to retrain the algorithm
    el.project_factorized = project_fact === undefined ? -1 : project_fact;
    el.chain_factorized = chain_fact === undefined ? -1 : chain_fact;
  }

  // just for sanity, remove any potential objects with which have null value
  // for apy and mean (there shouldn't be any, as we filter above)
  // (should only be on apyStdExpanding because if d was undefined or count < 2)
  dataEnriched = dataEnriched.filter(
    (el) => el.apy !== null && el.apyMeanExpanding !== null
  );

  // impute null values on apyStdExpanding (this will be null whenever we have pools with less than 2
  // samples, eg. whenever a new pool project is listed or an existing project adds new pools
  for (const el of dataEnriched) {
    el.apyStdExpanding = el.apyStdExpanding === null ? 0 : el.apyStdExpanding;
  }

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
    // 2. project === 'anchor' ("stable" apy, prediction would be confusing)
    // 3. less than 7 datapoints per pool
    // (low confidence in the model predictions backward looking features (mean and std)
    // are undeveloped and might skew prediction results)

    // for frontend, encoding predicted labels
    const classEncoding = {
      0: 'Down',
      1: 'Stable/Up',
    };

    const nullifyPredictionsCond =
      el.apy <= 0 || el.count < 7 || el.project === 'anchor';
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

  console.log('\nsaving data to S3');
  const bucket = process.env.BUCKET_DATA;
  const key = 'enriched/dataEnriched.json';
  dataEnriched = dataEnriched.sort((a, b) => b.tvlUsd - a.tvlUsd);
  await utils.writeToS3(bucket, key, dataEnriched);

  // also save to other "folder" where we keep track of hourly predictions (this will be used
  // for ML dashboard performance monitoring)
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  ).toISOString();
  const keyPredictions = `predictions-hourly/dataEnriched_${timestamp}.json`;
  await utils.writeToS3(bucket, keyPredictions, dataEnriched);
  await utils.storeCompressed('defillama-datasets', 'yield-api/pools', {
    status: 'success',
    data: await buildPoolsEnriched(undefined),
  });
};

////// helper functions
// calculate absolute change btw current apy and offset value
const enrich = (pool, days, offsets) => {
  const poolC = { ...pool };
  for (let d = 0; d < days.length; d++) {
    let X = offsets[d].body.data.offsets;
    const apyOffset = X.find((x) => x.pool === poolC.pool)?.apy;
    poolC[`apyPct${days[d]}D`] = poolC['apy'] - apyOffset;
  }
  return poolC;
};

const checkStablecoin = (el, stablecoins) => {
  let tokens = el.symbol.split('-').map((el) => el.toLowerCase());

  let stable;
  // specific case for aave amm positions
  if (el.project === 'aave' && el.symbol.toLowerCase().includes('amm')) {
    tok = tokens[0].split('weth');
    stable = tok[0].includes('wbtc') ? false : tok.length > 1 ? false : true;
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

    // this case is for Bancor only
    if (tokens.includes('bnt') && x > 0) {
      stable = true;
    }
  }

  return stable;
};

// no IL in case of:
// 1: - stablecoin
// 2: - 1 asset
// 3: - more than 1 asset but same underlying assets
const checkIlRisk = (el) => {
  const l1Token = ['btc', 'eth', 'avax', 'matic', 'eur'];
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
    // for bancor
  } else if (tokens.length === 2 && tokens.includes('bnt')) {
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

  // project specific
  if (el.project === 'aave') {
    exposure =
      el.symbol.toLowerCase().includes('ammuni') ||
      el.symbol.toLowerCase().includes('ammbpt')
        ? 'multi'
        : exposure;
  } else if (el.project === 'bancor') {
    exposure = 'single';
  } else if (el.project === 'badger-dao') {
    exposure = el.symbol.toLowerCase().includes('crv') ? 'multi' : exposure;
  }

  return exposure;
};

const addPoolInfo = (el, stablecoins) => {
  el['stablecoin'] = checkStablecoin(el, stablecoins);
  el['ilRisk'] =
    el.stablecoin && el.symbol.toLowerCase().includes('eur')
      ? checkIlRisk(el)
      : el.stablecoin
      ? 'no'
      : checkIlRisk(el);
  el['exposure'] = checkExposure(el);

  return el;
};
