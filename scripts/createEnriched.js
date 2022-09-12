const fs = require('fs');

const { confirm } = require('./confirm');
const { insertEnriched } = require('../src/controllers/enrichedController');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // need everything in config and their latest yield values,
  // calc all the fields as in triggerEnrichment
  // load yield table snapshot of daily values only
  const data = JSON.parse(fs.readFileSync('./enriched.json'));

  const response = await insertEnriched(data);
  console.log(response);
  process.exit(0);
})();
