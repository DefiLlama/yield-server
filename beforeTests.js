const path = require('path');
const axios = require('axios');
const fs = require('fs');

module.exports = async function () {
  require('dotenv').config({ path: './config.env' });

  const adapter = process.env.npm_config_adapter;
  const timestamp = process.env.npm_config_timestamp;
  if (!adapter) {
    console.error(
      `Missing argument, you need to provide the adapter name. Eg: npm run test --adapter=aave-v2`
    );
    process.exit(1);
  }
  const passedFile = path.resolve(process.cwd(), `./src/adaptors/${adapter}`);
  const module = require(passedFile);

  global.adapter = adapter;
  let apy = (await module.apy(timestamp)).sort((a, b) => b.tvlUsd - a.tvlUsd);
  fs.writeFileSync(`./${adapter}_test_output.json`, JSON.stringify(apy));

  // add project name prefix to pool field if not present already from adaptor itself
  // reason: while we test for duplicated pools within a project and against all other projects
  // during the PR phase, we also want to make sure once an adaptor is live, newly listed pool ids which weren't present
  // during development don't clash with existing ones. hence why we add the project name as a prefix to the
  // pool string.
  global.apy = apy.map((p) => ({
    ...p,
    pool: p.pool.toLowerCase().includes(p.project.toLowerCase())
      ? p.pool
      : `${p.project}-${p.pool}`,
  }));

  global.protocolsSlug = [
    ...new Set(
      (await axios.get('https://api.llama.fi/protocols')).data.map(
        (protocol) => protocol.slug
      )
    ),
  ];

  global.uniquePoolIdentifiersDB = new Set(
    (
      await axios.get(
        'https://1rwmj4tky9.execute-api.eu-central-1.amazonaws.com/simplePools'
      )
    ).data.data
      .filter((p) => p.project !== global.apy[0].project)
      .map((p) => p.pool)
  );
};
