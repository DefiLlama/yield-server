const axios = require('axios');

const RPC_URL = 'https://free.rpc.fastnear.com';
const PRICE_URL = 'https://coins.llama.fi/prices/current/';
const TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [500, 1000];

function limiter(maxConcurrent) {
  let active = 0;
  const waiting = [];

  const acquire = () => {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  return async (request) => {
    await acquire();
    try {
      return await request();
    } finally {
      release();
    }
  };
}

function retryable(error) {
  const status = error?.response?.status;
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  return error?.isAxiosError === true && error.response === undefined;
}

function statusOf(error) {
  if (Number.isInteger(error?.response?.status)) {
    return String(error.response.status);
  }
  return error?.isAxiosError === true ? 'network' : 'unknown';
}

function sanitizedError(context, category, status, cause) {
  return new Error(`${context} ${category} (${status})`, { cause });
}

function numeric(value, name) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new Error(`invalid ${name}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid ${name}`);
  return number;
}

function createDataClient(options = {}) {
  const http = options.http || axios;
  const now = options.now || Date.now;
  const sleep =
    options.sleep ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const diagnostic = options.diagnostic || console.warn;
  const runLimited = limiter(4);

  async function request(run, context) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runLimited(run);
      } catch (error) {
        if (!retryable(error) || attempt === 2) {
          throw sanitizedError(
            context,
            'transport error',
            statusOf(error),
            error
          );
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw new Error(`${context} transport error (unknown)`);
  }

  async function getJson(url, params) {
    const response = await request(
      () =>
        http.get(url, {
          params,
          timeout: TIMEOUT_MS,
          responseType: 'text',
          transformResponse: [(body) => body],
        }),
      'RHEA GET'
    );
    if (typeof response.data !== 'string') return response.data;
    try {
      return JSON.parse(response.data);
    } catch (error) {
      throw sanitizedError('RHEA GET', 'invalid JSON', 'schema', error);
    }
  }

  async function rpc(payload, context) {
    const response = await request(
      () => http.post(RPC_URL, payload, { timeout: TIMEOUT_MS }),
      context
    );
    const body = response?.data;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw sanitizedError(context, 'invalid response', 'schema', body);
    }
    if (body.error !== undefined) {
      throw sanitizedError(context, 'RPC error', 'application', body.error);
    }
    if (!body.result || typeof body.result !== 'object') {
      throw sanitizedError(context, 'invalid response', 'schema', body);
    }
    if (body.result.error !== undefined) {
      throw sanitizedError(
        context,
        'contract error',
        'application',
        body.result.error
      );
    }
    return body.result;
  }

  async function view(contract, method, args = {}, blockHeight) {
    if (typeof contract !== 'string' || typeof method !== 'string') {
      throw new Error('Invalid NEAR view target');
    }
    if (
      blockHeight !== undefined &&
      (!Number.isSafeInteger(blockHeight) || blockHeight <= 0)
    ) {
      throw new Error('Invalid NEAR block height');
    }

    const params = {
      request_type: 'call_function',
      ...(blockHeight === undefined
        ? { finality: 'final' }
        : { block_id: blockHeight }),
      account_id: contract,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    };
    const result = await rpc(
      { jsonrpc: '2.0', id: 'rhea-yields', method: 'query', params },
      `${contract}/${method}`
    );

    try {
      return JSON.parse(Buffer.from(result.result).toString());
    } catch (error) {
      throw sanitizedError(
        `${contract}/${method}`,
        'invalid JSON',
        'schema',
        error
      );
    }
  }

  async function finalBlock() {
    const result = await rpc(
      {
        jsonrpc: '2.0',
        id: 'rhea-yields',
        method: 'block',
        params: { finality: 'final' },
      },
      'NEAR final block'
    );
    const height = result.header?.height;
    const timestampNanosec = numeric(
      result.header?.timestamp_nanosec,
      'block timestamp'
    );
    const timestamp = timestampNanosec / 1e9;
    if (!Number.isSafeInteger(height) || height <= 0 || timestamp < 0) {
      throw sanitizedError(
        'NEAR final block',
        'invalid response',
        'schema',
        result.header
      );
    }
    return { height, timestamp };
  }

  function quote(value, nowSeconds) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('missing quote');
    }
    const price = numeric(value.price, 'price');
    const decimals = numeric(value.decimals, 'decimals');
    const timestamp = numeric(value.timestamp, 'timestamp');
    const confidence = numeric(value.confidence, 'confidence');
    const age = nowSeconds - timestamp;
    if (
      price <= 0 ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36 ||
      confidence < 0.5 ||
      age < 0 ||
      age > 3600
    ) {
      throw new Error('invalid quote values');
    }
    return { price, decimals, timestamp, confidence };
  }

  async function prices(tokenIds) {
    if (
      !Array.isArray(tokenIds) ||
      tokenIds.length === 0 ||
      tokenIds.some((id) => typeof id !== 'string' || id.trim() === '')
    ) {
      throw new Error('Invalid token IDs');
    }
    const ids = [...new Set(tokenIds)];
    const data = await getJson(
      PRICE_URL + ids.map((id) => `near:${id}`).join(',')
    );
    if (!data?.coins || typeof data.coins !== 'object') {
      throw new Error('Invalid price response');
    }

    const nowSeconds = now() / 1000;
    const result = new Map();
    for (const tokenId of ids) {
      try {
        result.set(tokenId, quote(data.coins[`near:${tokenId}`], nowSeconds));
      } catch (error) {
        diagnostic(`RHEA price ${tokenId}: ${error.message}`);
      }
    }
    if (result.size === 0) throw new Error('No valid prices');
    return result;
  }

  return { view, finalBlock, prices, getJson };
}

const client = createDataClient();

module.exports = { createDataClient, ...client };
