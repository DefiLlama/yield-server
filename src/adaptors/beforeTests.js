const path = require('path');
const axios = require('axios');
const fs = require('fs');

module.exports = async function () {
  require('dotenv').config({ path: '../../config.env' });

  const adapter = process.env.npm_config_adapter;
  const timestamp = process.env.npm_config_timestamp;
  if (!adapter) {
    console.error(
      `Missing argument, you need to provide the adapter name. Eg: npm run test --adapter=aave-v2`
    );
    process.exit(1);
  }

  // Construct the absolute path to the adapter module
  const adapterPath = path.resolve(__dirname, adapter);

  // Require the adapter module
  const adapterModule = require(adapterPath);

  // Set global variables
  global.adapter = adapter;
  global.apy = (await adapterModule.apy(timestamp)).sort(
    (a, b) => b.tvlUsd - a.tvlUsd
  );
  global.poolsUrl = adapterModule.url;

  // Write the APY data to a JSON file
  fs.writeFileSync(`./${adapter}_test_output.json`, JSON.stringify(global.apy));

  // Fetch data from external APIs and store in global variables
  global.protocolsSlug = [
    ...new Set(
      (await axios.get('https://api.llama.fi/protocols')).data.map(
        (protocol) => protocol.slug
      )
    ),
  ];

  global.uniquePoolIdentifiersDB = new Set(
    (await axios.get('https://yields.llama.fi/distinctID')).data
      .filter((p) => p.project !== global.apy[0].project)
      .map((p) => p.pool)
  );
};