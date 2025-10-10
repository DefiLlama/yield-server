const path = require('path');
const axios = require('axios');
const fs = require('fs');

try {
  const envPath = path.resolve(__dirname, '../../config.env');
  require('dotenv').config({ path: envPath });
} catch (e) {}

// support requiring TS adapters directly (eg: index.ts)
try {
  const tsConfigPath = path.resolve(__dirname, '../../tsconfig.json');
  require('ts-node').register({ transpileOnly: true, project: tsConfigPath });
} catch (e) {
  // ts-node may not be installed in some contexts; ignore if unavailable
}

module.exports = async function () {
  const adapter = process.env.npm_config_adapter;
  const timestamp = process.env.npm_config_timestamp;
  const isFast = !!process.env.npm_config_fast;
  if (!adapter) {
    console.error(
      `Missing argument, you need to provide the adapter name. Eg: npm run test --adapter=aave-v2`
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const isFileArg = /\.(ts|js)$/i.test(adapter);

  const candidates = [];
  if (isFileArg) {
    candidates.push(path.resolve(cwd, adapter));
    if (!cwd.includes('src/adaptors'))
      candidates.push(path.resolve(cwd, 'src/adaptors', adapter));
  } else {
    const baseDir = cwd.includes('src/adaptors')
      ? path.resolve(cwd, adapter)
      : path.resolve(cwd, 'src/adaptors', adapter);
    candidates.push(path.join(baseDir, 'index.js'));
    candidates.push(path.join(baseDir, 'index.ts'));
  }

  const resolvedAdapterPath = candidates.find((p) => fs.existsSync(p));
  if (!resolvedAdapterPath) {
    console.error(
      `Adapter not found. Tried:\n${candidates
        .map((p) => ' - ' + p)
        .join('\n')}`
    );
    process.exit(1);
  }

  const module = require(resolvedAdapterPath);

  global.adapter = adapter;
  global.apy = (await module.apy(timestamp)).sort(
    (a, b) => b.tvlUsd - a.tvlUsd
  );
  global.poolsUrl = module.url;

  const outputDir = path.resolve(__dirname, '../../.test-adapter-output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, `${adapter}.json`),
    JSON.stringify(global.apy)
  );

  if (!isFast) {
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
  }
};
