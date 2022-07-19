const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: './config.env' });

const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
  tvlUsd: 'number',
};

const apyTypes = ['number', 'object'];

if (process.argv.length < 3) {
  console.error(`Missing argument, you need to provide the filename of the adapter to test.
    Eg: node src/adaptors/test.js src/adaptors/aave/index.js`);
  process.exit(1);
}
const f = process.argv[2];
const passedFile = path.resolve(process.cwd(), f);
(async () => {
  console.log(`==== Testing ${f} ====`);

  const time = () => Date.now() / 1000;

  const module = require(passedFile);
  const start = time();
  // run adaptor
  let apy = await module.apy(process.argv[3]);
  apy = apy.sort((a, b) => b.tvlUsd - a.tvlUsd);
  console.log(`\nAdaptor Runtime: ${(time() - start).toFixed(2)} sec`);

  // add project name prefix to pool field if not present already from adaptor itself
  // reason: while we test for duplicated pools within a project and against all other projects
  // when an adaptor is being added, we want to make sure that newly listed pools form a project eg uniswap
  // do not clash against same ids from other projects. hence why we add the project name as a prefix to the
  // pool string
  apy = apy.map((p) => ({
    ...p,
    pool: p.pool.toLowerCase().includes(p.project.toLowerCase())
      ? p.pool
      : `${p.project}-${p.pool}`,
  }));

  // check
  console.log(`\nRunning tests...`);
  const uniquePoolIdentifiers = new Set();
  apy.map((pool) => {
    // a) pool string is unique
    if (uniquePoolIdentifiers.has(pool.pool)) {
      throw new Error(`Pool identifier ${pool.pool} is repeated`);
    }
    uniquePoolIdentifiers.add(pool.pool);

    // b) required fields and dataypes

    // apy fields
    let n = 0;
    for (const a of ['apy', 'apyBase', 'apyReward']) {
      if (Object.keys(pool).includes(a)) {
        if (apyTypes.includes(typeof pool[a])) {
          n += 1;
        } else {
          throw new Error(
            `Key ${a} of pool ${
              pool.pool
            } should be one of "${apyTypes}" but is ${typeof pool[a]}`
          );
        }
      }
    }
    if (n === 0) {
      throw new Error(
        `Pool ${pool.pool} requires at least one apy related field (apy, apyBase or apyReward) but only has ${pool}`
      );
    }

    // base fields
    for (const [key, intendedType] of Object.entries(baseFields)) {
      if (!intendedType.includes(typeof pool[key])) {
        throw new Error(
          `Key ${key} of pool ${pool.pool} should be "${intendedType}" but is ${pool[key]}`
        );
      }
    }
  });

  // c) is pool id already used by other project
  const uniquePoolIdentifiersDB = new Set(
    (
      await axios.get(
        'https://1rwmj4tky9.execute-api.eu-central-1.amazonaws.com/simplePools'
      )
    ).data.data
      .filter((p) => p.project !== apy[0].project)
      .map((p) => p.pool)
  );
  const duplicatedPoolIds = new Set(
    [...uniquePoolIdentifiers].filter((p) => uniquePoolIdentifiersDB.has(p))
  );
  if (duplicatedPoolIds.size !== 0) {
    throw new Error(
      `The following ${
        duplicatedPoolIds.size
      } pool identifier(s) already exist in the DB used by other projects: \n${[
        ...duplicatedPoolIds,
      ]}`
    );
  }

  // d) test for correct project name (should match tvl dashboard slug)
  const protocols = (await axios.get('https://api.llama.fi/protocols')).data;
  if (!new Set(protocols.map((project) => project.slug)).has(apy[0].project)) {
    throw new Error(
      `project field "${apy[0].project}" does not match the slug in /protocols endpoint`
    );
  }

  console.log(`\nNb of pools: ${apy.length}\n `);
  if (process.env.CI !== undefined) {
    console.log('\nSample pools:');
    console.table(apy.slice(0, 10));
  } else {
    console.log('\nSample pools:', apy.slice(0, 10));
  }

  // store full adaptor output for checks
  fs.writeFileSync(
    `./${f.split('/').slice(-2, -1)[0] + '_output'}.json`,
    JSON.stringify(apy)
  );

  process.exit(0);
})();
