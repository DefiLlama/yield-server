const utils = require('../utils');
const { erc20Abi } = require('./abis');
const { ethers } = require('ethers');

const CONFIG = {
  chain: utils.formatChain('berachain'),
  project: 'berancia',
  // TODO: change to production URL
  apiUrl: 'https://qa.berancia.io/api/vault-stats',
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
    apy: {
      base: string;
      leveraged: string | null;
      multiplier: number | null;
    };
    tvl: {
      total: string | null;
      base: string | null;
    };
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
  symbol: string,
  commonData: { chain: string; project: string }
): Pool => {
  const isLeveraged =
    vault.apy.leveraged !== null &&
    vault.apy.leveraged !== undefined &&
    vault.apy.leveraged !== '';
  const apyValue = isLeveraged ? vault.apy.leveraged : vault.apy.base;

  return {
    ...commonData,
    pool: vault.address,
    tvlUsd: parseAndFormatNumeric(vault.tvl.total),
    apyBase: parseAndFormatNumeric(apyValue),
    symbol,
    poolMeta: isLeveraged ? CONFIG.poolMetaLeveraged : CONFIG.poolMeta,
  };
};

const createProvider = () => {
  return new ethers.providers.JsonRpcProvider(CONFIG.rpcUrl);
};

const fetchVaultSymbol = async (
  address: string,
  provider: any
): Promise<string> => {
  try {
    const contract = new ethers.Contract(address, erc20Abi, provider);
    const symbol = await contract.symbol();
    return symbol;
  } catch (error) {
    throw new Error(`Failed to fetch symbol for ${address}: ${error.message}`);
  }
};

const fetchVaultSymbols = async (
  vaultAddresses: string[]
): Promise<string[]> => {
  const provider = createProvider();

  const symbolPromises = vaultAddresses.map((address) =>
    fetchVaultSymbol(address, provider)
  );

  return await Promise.all(symbolPromises);
};

const getPools = async (): Promise<Pool[]> => {
  const response = await fetchWithRetry(CONFIG.apiUrl);
  const data = await parseJsonResponse(
    response,
    validateBeranciaResponse,
    'Invalid response structure: missing vaults array'
  );

  const commonData = { chain: CONFIG.chain, project: CONFIG.project };

  const vaultAddresses = data.vaults.map((vault) => vault.address);
  // TODO: get from Berancia API
  const symbols = await fetchVaultSymbols(vaultAddresses);

  const pools = data.vaults.map((vault, index) =>
    transformVaultToPool(vault, symbols[index], commonData)
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: CONFIG.appUrl,
};
