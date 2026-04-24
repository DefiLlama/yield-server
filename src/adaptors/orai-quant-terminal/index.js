const utils = require('../utils');

const LCD_ENDPOINT = 'https://lcd.orai.io';
const CHAIN = 'arbitrum';
const PROJECT = 'orai-quant-terminal';
const APP_URL = 'https://quant.orai.io/vault';

// Each entry maps a vault to its stats contract.
// Data is read from statsContract, while pool identity uses vaultAddress.
const POOLS_CONFIG = [
  {
    statsContract: 'orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw',
    vaultAddress: '0xd3A1C2Bd6E1d163A7380D701c946aDCd82DD95b1',
    symbol: 'USDC',
    poolMeta: 'Golden Rhythm Vault',
    underlyingTokens: [],
    url: "https://quant.orai.io/vault-v3/0xd3a1c2bd6e1d163a7380d701c946adcd82dd95b1",
  },
  {
    statsContract: 'orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw',
    vaultAddress: '0xf90E1b849bFB17D57abDb07438d68ac787B5C587',
    symbol: 'USDC',
    poolMeta: 'Polymarket Vault',
    underlyingTokens: [],
    url: "https://quant.orai.io/vault-v2/0xf90e1b849bfb17d57abdb07438d68ac787b5c587",
  },
  {
    statsContract: 'orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw',
    vaultAddress: '0x5424293637Cc59ad7580aD1caC46e28D4801a587',
    symbol: 'USDC',
    poolMeta: 'XAU Alpha Vault',
    underlyingTokens: [],
    url: "https://quant.orai.io/vault-v2/0x5424293637cc59ad7580ad1cac46e28d4801a587",
  },
  {
    statsContract: 'orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw',
    vaultAddress: '0xE730aB590559d931c41590d6951f12dBDe273cCA',
    symbol: 'USDC',
    poolMeta: 'Delta Neutral Vault',
    underlyingTokens: [],
    url: "https://quant.orai.io/vault-v2/0xe730ab590559d931c41590d6951f12dbde273cca",
  },
];

function isPlaceholderAddress(address) {
  return typeof address !== 'string' || /x{6,}/.test(address);
}

function toQueryPath(queryMsg) {
  return encodeURIComponent(
    Buffer.from(JSON.stringify(queryMsg)).toString('base64')
  );
}

async function queryContract({ contract, queryMsg }) {
  const queryPath = toQueryPath(queryMsg);
  const url = `${LCD_ENDPOINT}/cosmwasm/wasm/v1/contract/${contract}/smart/${queryPath}`;
  const response = await utils.getData(url);
  return response?.data ?? response;
}

async function queryVaultStats(contract, vaultAddress) {
  const queryMsg =
    { get_vault_stats: { vault_address: vaultAddress.toLowerCase() } };
  return await queryContract({ contract, queryMsg });
}

function extractFirstNumber(payload, depth = 0) {
  if (depth > 8 || payload === null || payload === undefined) return null;
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
  if (typeof payload === 'string') {
    const value = Number(payload);
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractFirstNumber(item, depth + 1);
      if (value !== null) return value;
    }
    return null;
  }
  if (typeof payload !== 'object') return null;

  for (const value of Object.values(payload)) {
    const number = extractFirstNumber(value, depth + 1);
    if (number !== null) return number;
  }
  return null;
}

function extractNumericByKeys(payload, keys) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    if (!(key in payload)) continue;
    const value = extractFirstNumber(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeApyPercent(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  // If contract reports ratio (e.g. 0.1234), convert to percentage.
  return value <= 1 ? value * 100 : value;
}

async function buildPoolData(config) {
  if (
    isPlaceholderAddress(config.statsContract) ||
    isPlaceholderAddress(config.vaultAddress)
  )
    return null;

  const vaultStatsData = await queryVaultStats(
    config.statsContract,
    config.vaultAddress
  );

  const tvlSource = vaultStatsData?.tvl ?? vaultStatsData;
  const apySource = vaultStatsData?.apy ?? vaultStatsData;

  const tvlRaw =
    extractNumericByKeys(tvlSource, [
      'tvl_usd',
      'total_value_locked_usd',
      'total_tvl_usd',
      'usd',
      'amount_usd',
      'tvl',
    ]) ?? extractFirstNumber(tvlSource);
  const tvlUsd = tvlRaw / 1e6;

  const apyRaw =
    extractNumericByKeys(apySource, [
      'apy',
      'apr',
      'current_apy',
      'vault_apy',
      'strategy_apy',
      'apy_percent',
      'apr_percent',
    ]) ?? extractFirstNumber(apySource);

  const apy = normalizeApyPercent(apyRaw);

  if (!Number.isFinite(tvlUsd) || tvlUsd <= 0 || apy === null) return null;

  return {
    pool: `${config.vaultAddress}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: utils.formatSymbol(config.symbol),
    tvlUsd,
    apy,
    underlyingTokens: config.underlyingTokens,
    poolMeta: config.poolMeta,
    url: config.url,
    token: config.vaultAddress,
  };
}

async function apy() {
  const pools = await Promise.all(POOLS_CONFIG.map(buildPoolData));
  return pools.filter(Boolean);
}

module.exports = {
  timetravel: false,
  apy,
  url: APP_URL,
};
