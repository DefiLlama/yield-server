const utils = require('../utils');

// Berachain token address mapping for underlyingTokens
const BERACHAIN_TOKENS: Record<string, string> = {
  WBERA: '0x7507c1dc16935B82698e4C63f2746A2fCf994dF8',
  HONEY: '0x0E4aaF1351de4c0264C5c7056Ef3777b41BD8e03',
  WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
  WETH: '0x6969696969696969696969696969696969696969',
  USDC: '0xd6D83aF58a19Cd14eF3CF6fe848C9A4d21e5727c',
  USDT: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  BYUSD: '0x688e72142674041f8f6Af4c808a4045cA1D6BBc6',
  iBGT: '0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b',
  BERA: '0x7507c1dc16935B82698e4C63f2746A2fCf994dF8', // native BERA → WBERA
  yBGT: '0xac03CABA51e17c86c921E1f6CBFBdC91F8BB2E6b',
  yBERA: '0x7507c1dc16935B82698e4C63f2746A2fCf994dF8',
  sNECT: '0x1cE0a25D13CE4d52071aE7e02Cf1F6606F4C79d3',
};

const CONFIG = {
  chain: utils.formatChain('berachain'),
  project: 'berancia',
  apiUrl: 'https://app.berancia.io/api/vault-stats',
  appUrl: 'https://app.berancia.io/',
  rpcUrl: 'https://rpc.berachain.com',
  poolMeta: 'BGT Maximizer',
  poolMetaLeveraged: 'BGT Maximizer Leveraged',
  fetchConfig: {
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  },
};

interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
}

interface BeranciaResponse {
  vaults: {
    address: string;
    symbol: string;
    apy: {
      base: string;
      leveraged: string | null;
      multiplier: number | null;
    };
    tvl: {
      total: string | null;
      base: string | null;
    };
    tokenSymbols: string[];
  }[];
}

const fetchWithTimeout = async (
  url: string,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
};

const fetchWithRetry = async (
  url: string,
  config = CONFIG.fetchConfig
): Promise<Response> => {
  let lastError: Error;

  for (let attempt = 0; attempt < config.retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, config.timeout);

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} - ${response.statusText}`
        );
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt < config.retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
      }
    }
  }

  throw lastError;
};

const validateBeranciaResponse = (data: unknown): data is BeranciaResponse => {
  return (
    data !== null &&
    typeof data === 'object' &&
    'vaults' in data &&
    Array.isArray((data as any).vaults)
  );
};

const parseJsonResponse = async <T>(
  response: Response,
  validator: (data: unknown) => data is T,
  errorMessage: string = 'Invalid response structure'
): Promise<T> => {
  try {
    const data: unknown = await response.json();

    if (!validator(data)) {
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${error.message}`);
  }
};

const safeParseNumber = (value: string | null | undefined): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return isNaN(parsed) ? 0 : parsed;
};

const truncateToTwoDecimals = (value: number): number => {
  return Math.floor(value * 100) / 100;
};

const parseAndFormatNumeric = (value: string | null | undefined): number => {
  const parsed = safeParseNumber(value);
  return truncateToTwoDecimals(parsed);
};

const transformVaultToPool = (
  vault: BeranciaResponse['vaults'][0],
  commonData: { chain: string; project: string }
): Pool => {
  const isLeveraged =
    vault.apy.leveraged !== null &&
    vault.apy.leveraged !== undefined &&
    vault.apy.leveraged !== '';
  const apyValue = isLeveraged ? vault.apy.leveraged : vault.apy.base;

  const underlyingTokens = vault.tokenSymbols
    .map((s) => BERACHAIN_TOKENS[s])
    .filter(Boolean);

  return {
    ...commonData,
    pool: vault.address,
    tvlUsd: parseAndFormatNumeric(vault.tvl.total),
    apyBase: parseAndFormatNumeric(apyValue),
    symbol: vault.tokenSymbols.join('-'),
    poolMeta: isLeveraged ? CONFIG.poolMetaLeveraged : CONFIG.poolMeta,
    ...(underlyingTokens.length > 0 && { underlyingTokens }),
  };
};

const getPools = async (): Promise<Pool[]> => {
  const response = await fetchWithRetry(CONFIG.apiUrl);
  const data = await parseJsonResponse(
    response,
    validateBeranciaResponse,
    'Invalid response structure: missing vaults array'
  );

  const commonData = { chain: CONFIG.chain, project: CONFIG.project };

  const pools = data.vaults.map((vault) =>
    transformVaultToPool(vault, commonData)
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: CONFIG.appUrl,
};
