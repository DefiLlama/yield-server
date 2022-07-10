const superagent = require('superagent');
const SSM = require('aws-sdk/clients/ssm');
const ss = require('simple-statistics');

const utils = require('../utils/s3');
const adaptorsToExclude = require('../utils/exclude');
const { buildPoolsEnriched } = require('./getPoolsEnriched');

module.exports.handler = async (event) => {
  await main();
};

// loading latest "base" data from db for each pool
// enriching the data with 1/7/30 day pct-changes of apy
// store single enriched data file as json to s3
const main = async () => {
  console.log(`START DATA ENRICHMENT at ${new Date()}`);

  ////// 1) load latest data
  const urlBase = process.env.APIG_URL;
  console.log('\n1. pulling base data...');
  let data = await superagent.get(`${urlBase}/simplePools`);
  data = data.body.data;
  // remove everything in adaptorsToExclude
  data = data.filter((p) => !adaptorsToExclude.includes(p.project));

  ////// 2 add pct-change columns
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

  ////// 3) remove outliers
  // remove pools which have extreme values of TVL and/or APY
  // note(!) this could be more sophisticated via learned quantiles
  // but keeping it simple here and applying some basic thrs
  console.log('\n3. checking for apy null values and outliers');
  const UBApy = 1e6;
  const UBTvl = 2e10;
  outliers = dataEnriched.filter((el) => el.apy > UBApy && el.tvlUsd > UBTvl);
  console.log(`Found and removing ${outliers.length} pools from dataEnriched`);
  dataEnriched = dataEnriched.filter(
    (el) => el.apy !== null && el.apy <= UBApy && el.tvlUsd <= UBTvl
  );

  ////// 4) add defillama projectName for frontend
  console.log('\n4. adding defillama protocol name field');
  const config = (
    await superagent.get('https://api.llama.fi/protocols')
  ).body.reduce(
    (all, c) => ({
      ...all,
      [c.slug]: c.name,
    }),
    {}
  );
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    projectName: config[p.project],
  }));

  ////// 5) add exposure, ilRisk and stablecoin fields
  console.log('\n5. adding additional pool info fields');
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

  ////// 6) add ml features
  console.log('\n6. adding ml features');
  let dataStd = await superagent.get(`${urlBase}/stds`);

  // calculating both backward looking std and mean aking into account the current apy value
  const dataStdUpdated = [];
  for (const el of dataEnriched) {
    d = dataStd.body.data.find((i) => i.pool === el.pool);

    if (d !== undefined) {
      // calc std using welford's algorithm
      // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
      // For a new value newValue, compute the new count, new mean, the new M2.
      // mean accumulates the mean of the entire dataset
      // M2 aggregates the squared distance from the mean
      // count aggregates the number of samples seen so far
      count = d.count;
      mean = d.mean;
      mean2 = d.mean2;

      count += 1;
      delta = el.apy - mean;
      mean += delta / count;
      delta2 = el.apy - mean;
      mean2 += delta * delta2;
    } else {
      // in case of a new pool, we won't have an entry yet in db and d will be undefined
      // need to store count, mean and mean2 into table
      count = 1;
      mean = el.apy;
      mean2 = 0;
    }
    // add the backward looking stats
    // adding count as well, will use this to nullify predictions for objects which have less than 7 samples
    el['count'] = count;
    el['apyStdExpanding'] =
      d === undefined || count < 2 ? null : Math.sqrt(mean2 / (count - 1));
    // for both undefined or not, the apy will be the (if undefined, mean === the current apy)
    el['apyMeanExpanding'] = mean;

    // update std table only for pools which match the last hour of current day
    const currentDay = new Date().toISOString().split('T')[0];
    if (el.timestamp === [currentDay, '23:00:00.000Z'].join('T')) {
      console.log('updating std table');
      dataStdUpdated.push({
        pool: el.pool,
        count,
        mean,
        mean2,
      });
    }
  }

  if (dataStdUpdated.length > 0) {
    const ssm = new SSM();
    const options = {
      Name: `${process.env.SSM_PATH}/bearertoken`,
      WithDecryption: true,
    };
    const token = await ssm.getParameter(options).promise();
    const response = await superagent
      .post(`${urlBase}/stds`)
      .send(dataStdUpdated)
      .set({ Authorization: `Bearer ${token.Parameter.Value}` });
    console.log('/stds response: \n', response.body);
  }

  // bin std into stability metric
  const stds = dataEnriched
    .map((el) => el.apyStdExpanding)
    .filter((el) => el !== null);
  const quantiles = {
    q25: ss.quantile(stds, 0.25),
    q50: ss.quantile(stds, 0.5),
    q75: ss.quantile(stds, 0.75),
  };

  dataEnriched = dataEnriched.map((el) => ({
    ...el,
    Stability:
      el.apyStdExpanding <= quantiles.q25
        ? 'A'
        : el.apyStdExpanding <= quantiles.q50
        ? 'B'
        : el.apyStdExpanding <= quantiles.q75
        ? 'C'
        : 'D',
  }));

  ////// 7) add the algorithms predictions
  console.log('\n7. adding apy runway prediction');

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

  let y_pred = await superagent
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
    );

  y_pred = y_pred.body.predictions;
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

  // removing 0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d (saitama-weth sushiswap on ethereum)
  // had insane pump in price from coingecko, likely wrong
  dataEnriched = dataEnriched.filter(
    (p) => p.pool !== '0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d'
  );

  ////// 7) save enriched data to s3
  console.log('\n7. saving data to S3');
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
    stable = stablecoins.some((x) => tokens[0].includes(x));
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
