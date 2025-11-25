const axios = require('axios');

const DATA_URL = 'https://raw.githubusercontent.com/iaeroProtocol/ChainProcessingBot/main/data/estimated_rewards_usd.json';

const AERO_TOKEN = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const VAULT_ADDRESS = '0x180DAB53968e599Dd43CF431E27CB01AA5C37909';

const main = async () => {
  // Use axios directly to avoid any caching in utils.getData
  const response = await axios.get(DATA_URL, {
    headers: {
      'Cache-Control': 'no-cache',
      'Accept': 'application/json'
    }
  });
  
  const data = response.data;

  // Validate response
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid data response: ${JSON.stringify(data)}`);
  }

  // Parse TVL - string in 1e18 precision
  const tvlUsdRaw = data.tvlUSD_1e18;
  if (!tvlUsdRaw) {
    throw new Error(`Missing tvlUSD_1e18. Fields: ${Object.keys(data).join(', ')}`);
  }
  const tvlUsd = Number(tvlUsdRaw) / 1e18;

  // Parse APY - string like "42.5"
  const apyRaw = data.apyPct;
  if (apyRaw === undefined || apyRaw === null) {
    throw new Error(`Missing apyPct. Fields: ${Object.keys(data).join(', ')}`);
  }
  const apy = Number(apyRaw);

  // Validate
  if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
    throw new Error(`Invalid tvlUsd: ${tvlUsd}`);
  }
  if (!Number.isFinite(apy) || apy < 0) {
    throw new Error(`Invalid apy: ${apy}`);
  }

  return [{
    pool: VAULT_ADDRESS,
    chain: 'Base',
    project: 'iaero-protocol',
    symbol: 'iAERO',
    tvlUsd,
    apyBase: apy,
    underlyingTokens: [AERO_TOKEN],
    url: 'https://iaero.finance'
  }];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://iaero.finance',
};