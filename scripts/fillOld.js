const path = require('path');
const dotenv = require('dotenv');

const AWS = require('aws-sdk');

const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const { confirm } = require('../src/utils/confirm');
const dbConnection = require('../src/utils/dbConnection.js');
const { insertPools } = require('../src/handlers/triggerAdaptor');

const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;

dotenv.config({ path: './config.env' });

(async () => {
  if (process.argv.length < 4) {
    console.error(`Missing argument, you need to provide the adaptor name, a
      unix timestamp in seconds and optionally the number of days you want to backfill the data
      Eg: node scripts/fillOld.js pangolin 1648098107 10`);
    process.exit(1);
  }

  await confirm('Confirm with `yes` if you want to start the fillOld script: ');

  const project = process.argv[2];
  let timestamp = process.argv[3];
  const maxDays = process.argv[4] === undefined ? 1 : process.argv[4];
  // round timestamp to midnight
  // eg 2022-04-06T00:00:00.000Z
  timestamp = Math.floor(timestamp / 60 / 60 / 24) * 24 * 60 * 60;
  const offset = 86400;
  const passedFile = path.resolve(
    process.cwd(),
    `src/adaptors/${project}/index.js`
  );

  // 1. load module
  const module = require(passedFile);
  if (!module.timetravel)
    return console.log(`${project} can't timetravel, exiting!`);

  // 2. run adaptor
  console.log(`Starting timetravel for ${project}...\n`);
  for (let i = 0; i < maxDays; i++) {
    console.log(
      `Unix: ${timestamp}, ISO: ${new Date(
        timestamp * 1000
      ).toISOString()}, Nb: ${i + 1}`
    );

    console.log('\trunning adaptor');
    const data = await module.apy(timestamp);

    // filter to $1k usd tvl
    const tvlMinThr = 1e3;
    let dataDB = data.filter((el) => el.tvlUsd >= tvlMinThr);

    // add timestamp
    dataDB = dataDB.map((p) => ({
      ...p,
      timestamp: new Date(timestamp * 1000),
    }));

    // DB update
    // step1: we delete all hourly samples on that particular day for that project
    // step2: we insert the new ones
    // reason instead of updateMany: if we'd just use an update operation without deleting anything,
    // we'd have only outdated objects for that day with the exception of the updated one.
    // -> confusing when looking at the historcal data and especially bad when we want to use the old data
    // for some analysis work as nothing would make sense
    try {
      // delete
      const responseDelete = (await deletePools(timestamp, project)).response;
      console.log(`\tDeleted ${responseDelete.n} samples`);

      // insert
      const responseInsert = (await insertPools(dataDB)).response;
      console.log(`\t${responseInsert} samples\n`);
    } catch (err) {
      throw new Error(err);
    }
    // update timestamp
    timestamp -= offset;
  }
  console.log(`\njob finished, backfilled ${maxDays} day(s)`);

  process.exit(0);
})();

const deletePools = async (timestamp, project) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const lb = new Date(timestamp * 1000);
  const ub = new Date((timestamp + 86400) * 1000);

  // we filter to a project and the current timestamp from midnight up to the next day midnight
  // eg timestamp 1649116800 == 2022-04-05T00:00:00.000Z
  // lb == 2022-04-05T00:00:00.000Z; ub == 2022-04-06T00:00:00.000Z
  // we remove everything >= lb up to < ub
  const filter = {
    project,
    timestamp: { $gte: lb, $lt: ub },
  };

  const response = await M.deleteMany(filter);

  if (!response) {
    return new AppError("Couldn't delete data", 404);
  }

  return {
    status: 'success',
    response,
  };
};
