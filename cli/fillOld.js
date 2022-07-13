const path = require('path');
const dotenv = require('dotenv');

const AWS = require('aws-sdk');
const { insertPools, deletePools } = require('../src/api/controllers');

const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;

dotenv.config({ path: './config.env' });

if (process.argv.length < 3) {
  console.error(`Missing argument, you need to provide the adaptor name a, 
    unix timestamp in seconds and optionally the number of days you want to backfill the data
    Eg: node scripts/fillOld.js pangolin 1648098107 10`);
  process.exit(1);
}

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

(async () => {
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
      const responseDelete = (await deletePools(timestamp, project)).body
        .response;
      console.log(`\tDeleted ${responseDelete.n} samples`);

      // insert
      const responseInsert = (await insertPools(dataDB)).body.response;
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
