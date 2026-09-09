const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { createDataClient } = require('./data');

const tick = () => new Promise((resolve) => setImmediate(resolve));

function axiosError(status) {
  const error = new Error(status ? `HTTP ${status}` : 'network');
  error.isAxiosError = true;
  if (status !== undefined) error.response = { status };
  return error;
}

function encoded(value) {
  return Array.from(Buffer.from(JSON.stringify(value)));
}

function axiosWithRawJson(body, onAttempt = () => {}) {
  return axios.create({
    adapter: async (config) => {
      onAttempt(config);
      return {
        data: body,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
        request: {},
      };
    },
  });
}

test('view emits final and fixed-block NEAR requests and decodes JSON', async () => {
  const requests = [];
  const client = createDataClient({
    http: {
      post: async (...args) => {
        requests.push(args);
        return { data: { result: { result: encoded({ ok: true }) } } };
      },
    },
  });

  assert.deepEqual(await client.view('contract.near', 'read', { value: 7 }), {
    ok: true,
  });
  await client.view('contract.near', 'read', {}, 123);

  assert.equal(requests[0][0], 'https://free.rpc.fastnear.com');
  assert.equal(requests[0][2].timeout, 15000);
  assert.deepEqual(requests[0][1].params, {
    request_type: 'call_function',
    finality: 'final',
    account_id: 'contract.near',
    method_name: 'read',
    args_base64: 'eyJ2YWx1ZSI6N30=',
  });
  assert.deepEqual(requests[1][1].params, {
    request_type: 'call_function',
    block_id: 123,
    account_id: 'contract.near',
    method_name: 'read',
    args_base64: 'e30=',
  });
});

test('view preserves RPC failure as a cause without retrying application errors', async () => {
  const rpcFailure = { code: -32000, message: 'contract execution failed' };
  let attempts = 0;
  const client = createDataClient({
    http: {
      post: async () => {
        attempts += 1;
        return { data: { error: rpcFailure } };
      },
    },
  });

  await assert.rejects(
    client.view('contract.near', 'read'),
    (error) =>
      /contract\.near\/read.*RPC error/.test(error.message) &&
      error.cause === rpcFailure
  );
  assert.equal(attempts, 1);
});

test('view does not retry contract or JSON decoding failures', async () => {
  for (const result of [
    { error: { message: 'method failed' } },
    { result: [123] },
  ]) {
    let attempts = 0;
    const client = createDataClient({
      http: {
        post: async () => {
          attempts += 1;
          return { data: { result } };
        },
      },
    });

    await assert.rejects(client.view('contract.near', 'read'));
    assert.equal(attempts, 1);
  }
});

test('transport retries only network, 429 and 5xx failures with bounded delays', async () => {
  const delays = [];
  const outcomes = [axiosError(503), axiosError(429), { data: { ok: true } }];
  const client = createDataClient({
    http: {
      get: async () => {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
    sleep: async (ms) => delays.push(ms),
  });

  assert.deepEqual(await client.getJson('https://public.example/data'), {
    ok: true,
  });
  assert.deepEqual(delays, [500, 1000]);

  let attempts = 0;
  const noRetry = createDataClient({
    http: {
      get: async () => {
        attempts += 1;
        throw axiosError(400);
      },
    },
    sleep: async () => assert.fail('400 must not wait for a retry'),
  });
  await assert.rejects(noRetry.getJson('https://public.example/data'));
  assert.equal(attempts, 1);
});

test('getJson strictly parses raw JSON through the real axios transform boundary', async () => {
  const configs = [];
  const client = createDataClient({
    http: axiosWithRawJson(
      '{"coins":{"near:token.near":{"price":1}}}',
      (config) => configs.push(config)
    ),
  });

  assert.deepEqual(await client.getJson('https://public.example/data'), {
    coins: { 'near:token.near': { price: 1 } },
  });
  assert.equal(configs.length, 1);
});

test('getJson rejects malformed raw JSON without retrying it as a network error', async () => {
  let attempts = 0;
  const delays = [];
  const client = createDataClient({
    http: axiosWithRawJson('not-json', () => {
      attempts += 1;
    }),
    sleep: async (ms) => delays.push(ms),
  });

  await assert.rejects(
    client.getJson('https://public.example/data'),
    /RHEA GET invalid JSON \(schema\)/
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test('retry delays do not occupy the four shared request slots', async () => {
  let calls = 0;
  const sleepers = [];
  const client = createDataClient({
    http: {
      get: async () => {
        calls += 1;
        if (calls <= 4) throw axiosError();
        return { data: { ok: true } };
      },
    },
    sleep: () => new Promise((resolve) => sleepers.push(resolve)),
  });

  const retrying = Array.from({ length: 4 }, (_, i) =>
    client.getJson(`https://public.example/retry-${i}`)
  );
  await tick();
  const fifth = client.getJson('https://public.example/fifth');
  await tick();

  assert.equal(calls, 5);
  assert.deepEqual(await fifth, { ok: true });
  sleepers.splice(0).forEach((resolve) => resolve());
  await Promise.all(retrying);
});

test('one client permits at most four in-flight HTTP requests', async () => {
  let active = 0;
  let maximum = 0;
  const releases = [];
  const client = createDataClient({
    http: {
      get: () => {
        active += 1;
        maximum = Math.max(maximum, active);
        return new Promise((resolve) =>
          releases.push(() => {
            active -= 1;
            resolve({ data: { ok: true } });
          })
        );
      },
    },
  });
  const requests = Array.from({ length: 6 }, (_, i) =>
    client.getJson(`https://public.example/${i}`)
  );

  await tick();
  assert.equal(active, 4);
  releases.shift()();
  await tick();
  assert.equal(active, 4);
  while (releases.length > 0) {
    releases.shift()();
    await tick();
  }
  await Promise.all(requests);
  assert.equal(maximum, 4);
});

test('finalBlock returns validated height and epoch seconds', async () => {
  const client = createDataClient({
    http: {
      post: async () => ({
        data: {
          result: {
            header: {
              height: 214671265,
              timestamp_nanosec: '1788789651508120316',
            },
          },
        },
      }),
    },
  });

  assert.deepEqual(await client.finalBlock(), {
    height: 214671265,
    timestamp: 1788789651.5081203,
  });
});

test('prices keeps valid per-token quotes and reports invalid or missing entries', async () => {
  const diagnostics = [];
  const now = 2_000_000;
  const client = createDataClient({
    http: {
      get: async () => ({
        data: {
          coins: {
            'near:valid.near': {
              price: '1.01',
              decimals: '6',
              timestamp: String(now - 60),
              confidence: '0.9',
            },
            'near:stale.near': {
              price: 1,
              decimals: 6,
              timestamp: now - 3601,
              confidence: 0.99,
            },
            'near:bad.near': {
              price: true,
              decimals: 6,
              timestamp: now,
              confidence: 0.99,
            },
            'near:precision.near': {
              price: 1,
              decimals: 37,
              timestamp: now,
              confidence: 0.99,
            },
            'near:future.near': {
              price: 1,
              decimals: 6,
              timestamp: now + 1,
              confidence: 0.99,
            },
            'near:uncertain.near': {
              price: 1,
              decimals: 6,
              timestamp: now,
              confidence: 0.49,
            },
          },
        },
      }),
    },
    now: () => now * 1000,
    diagnostic: (message) => diagnostics.push(message),
  });

  assert.deepEqual(
    [
      ...(await client.prices([
        'valid.near',
        'stale.near',
        'bad.near',
        'precision.near',
        'future.near',
        'uncertain.near',
        'missing.near',
      ])),
    ],
    [
      [
        'valid.near',
        { price: 1.01, decimals: 6, timestamp: now - 60, confidence: 0.9 },
      ],
    ]
  );
  assert.deepEqual(
    diagnostics.map((message) => message.split(':')[0]),
    [
      'RHEA price stale.near',
      'RHEA price bad.near',
      'RHEA price precision.near',
      'RHEA price future.near',
      'RHEA price uncertain.near',
      'RHEA price missing.near',
    ]
  );
});

test('prices rejects when every requested quote is unusable', async () => {
  const client = createDataClient({
    http: { get: async () => ({ data: { coins: {} } }) },
    diagnostic: () => {},
  });

  await assert.rejects(client.prices(['missing.near']), /No valid prices/);
});
