const path = require('path');
const axios = require('axios');
const fs = require('fs');

module.exports = async function () {
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

  global.apy = (await module.apy(timestamp)).sort(
    (a, b) => b.tvlUsd - a.tvlUsd
  );

  fs.writeFileSync(`./${adapter}_test_output.json`, JSON.stringify(global.apy));

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
