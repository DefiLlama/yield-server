const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: './config.env' });

const baseFields = {
  pool: 'string',
  chain: 'string',
  project: 'string',
  symbol: 'string',
};

// tvlUsd: finite Number
// apy, apyBase, apyReward (min 1 field): finite Number

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

  // store full adaptor output for checks
  fs.writeFileSync(
    `./${f.split('/').slice(-2, -1)[0] + '_output'}.json`,
    JSON.stringify(apy)
  );

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
        if (Number.isFinite(pool[a])) {
          n += 1;
        }
      }
    }
    if (n === 0) {
      console.log(pool);
      throw new Error(
        `Pool ${pool.pool} requires at least one apy related field (apy, apyBase or apyReward) which is a finite Number`
      );
    }

    // tvl field
    if (!Number.isFinite(pool['tvlUsd'])) {
      throw new Error(
        `tvlUsd of pool ${pool.pool} should be a finite Number but is ${pool['tvlUsd']}`
      );
    }

    // base fields
    for (const [key, intendedType] of Object.entries(baseFields)) {
      if (typeof pool[key] !== intendedType) {
        throw new Error(
          `Key ${key} of pool ${pool.pool} should be "${intendedType}" but is ${pool[key]}`
        );
      }
    }

    // rewardTokens
    for (const f of ['rewardTokens', 'underlyingTokens']) {
      if (pool[f]) {
        if (pool[f].length === 0) continue;
        if (
          !pool[f] instanceof Array ||
          new Set(pool[f].map((s) => typeof s)).size > 1 ||
          !new Set(pool[f].map((s) => typeof s)).has('string')
        ) {
          console.log(pool);
          throw new Error(
            `Key ${f} of pool ${pool.pool} should be an Array of string values`
          );
        }
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

  process.exit(0);
})();
