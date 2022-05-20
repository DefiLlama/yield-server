const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: './config.env' });

const keyType = {
  "tvlUsd": "number",
  "apy": "number"
}

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

  const uniquePoolIdentifiers = new Set()
  apy.map(pool=>{
    if(uniquePoolIdentifiers.has(pool.pool)){
      throw new Error(`Pool identifier ${pool.pool} is repeated`)
    }
    uniquePoolIdentifiers.add(pool.pool)
    for(const key of ["pool", "chain", "project", "symbol", "tvlUsd", "apy"]){
      const intendedType = keyType[key] ?? "string"
      if(typeof pool[key] !== intendedType){
        throw new Error(`Key ${key} of pool ${pool.pool} should be "${intendedType}" but is ${pool[key]}`)
      }
    }
  })

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
