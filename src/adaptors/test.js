const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './config.env' });

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
  let apy = await module.apy(process.argv[3]);
  apy = apy.sort((a, b) => b.tvlUsd - a.tvlUsd);

  console.log(`\nNb of pools: ${apy.length}\n `);
  console.log('\nSample pools:', apy.slice(0, 10));
  console.log(`\nRuntime: ${(time() - start).toFixed(2)} sec`);

  if (process.argv[3] === 'save') {
    fs.writeFileSync(
      `./${f.split('/').slice(-2, -1)[0] + '_output'}.json`,
      JSON.stringify(apy)
    );
  }

  process.exit(0);
})();
