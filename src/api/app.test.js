const redisValues = new Map();
const mockRedis = {
  get: jest.fn((key) => Promise.resolve(redisValues.get(key) ?? null)),
  on: jest.fn(),
  set: jest.fn((key, value) => {
    redisValues.set(key, value);
    return Promise.resolve('OK');
  }),
};

jest.mock('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

const axios = require('axios');
jest.mock('axios');

jest.mock('../utils/s3', () => ({
  readFromS3: jest.fn().mockResolvedValue([
    {
      pool: '11111111-1111-4111-8111-111111111111',
      project: 'alpha',
    },
    {
      pool: '22222222-2222-4222-8222-222222222222',
      project: 'beta',
    },
    {
      pool: '33333333-3333-4333-8333-333333333333',
      project: 'alpha,beta',
    },
  ]),
}));

const app = require('./app');

const request = async (server, path, options) => {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}${path}`, options);
};

describe('Redis response cache', () => {
  let server;

  beforeAll((done) => {
    server = app.listen(0, '127.0.0.1', done);
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    redisValues.clear();
    mockRedis.get.mockClear();
    mockRedis.set.mockClear();
    axios.get.mockReset().mockResolvedValue({
      data: { status: 'success', data: [{ pool: 'pool-1' }] },
    });
  });

  test('irrelevant query parameters share the same cache entry', async () => {
    await request(server, '/pools?ignored=one');
    await request(server, '/pools?ignored=two');

    const writtenKeys = mockRedis.set.mock.calls.map(([key]) => key);
    expect(writtenKeys).toEqual(['data#/pools', 'lastUpdate#/pools']);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test('cached responses expire instead of accumulating indefinitely', async () => {
    await request(server, '/pools');

    expect(mockRedis.set.mock.calls).toEqual([
      expect.arrayContaining(['data#/pools', expect.any(String), 'EX']),
      expect.arrayContaining(['lastUpdate#/pools', expect.any(Number), 'EX']),
    ]);
    expect(mockRedis.set.mock.calls[0][3]).toBe(7200);
    expect(mockRedis.set.mock.calls[1][3]).toBe(7200);
  });

  test('pool queries keep separate cache entries', async () => {
    await request(
      server,
      '/poolsEnriched?pool=11111111-1111-4111-8111-111111111111&ignored=one'
    );
    await request(
      server,
      '/poolsEnriched?pool=22222222-2222-4222-8222-222222222222&ignored=two'
    );

    const writtenKeys = mockRedis.set.mock.calls.map(([key]) => key);
    expect(writtenKeys).toEqual([
      'data#/poolsenriched?pool=11111111-1111-4111-8111-111111111111',
      'lastUpdate#/poolsenriched?pool=11111111-1111-4111-8111-111111111111',
      'data#/poolsenriched?pool=22222222-2222-4222-8222-222222222222',
      'lastUpdate#/poolsenriched?pool=22222222-2222-4222-8222-222222222222',
    ]);
  });

  test('pro pool filters keep separate cache entries', async () => {
    await request(server, '/poolsPro?project=alpha&ignored=one');
    await request(server, '/poolsPro?project=beta&ignored=two');

    const writtenKeys = mockRedis.set.mock.calls.map(([key]) => key);
    expect(writtenKeys).toEqual([
      'data#/poolspro?project=%22alpha%22',
      'lastUpdate#/poolspro?project=%22alpha%22',
      'data#/poolspro?project=%22beta%22',
      'lastUpdate#/poolspro?project=%22beta%22',
    ]);
  });

  test('repeated filter values do not collide with a comma in one value', async () => {
    const repeated = await request(
      server,
      '/poolsPro?project=alpha&project=beta'
    );
    const commaSeparated = await request(
      server,
      '/poolsPro?project=alpha%2Cbeta'
    );

    expect((await repeated.json()).data).toEqual([]);
    expect((await commaSeparated.json()).data).toEqual([
      expect.objectContaining({ project: 'alpha,beta' }),
    ]);
  });

  test('equivalent route spellings preserve meaningful query parameters', async () => {
    const firstPool = await request(
      server,
      '/POOLSENRICHED/?pool=11111111-1111-4111-8111-111111111111'
    );
    const secondPool = await request(
      server,
      '/POOLSENRICHED/?pool=22222222-2222-4222-8222-222222222222'
    );
    const firstProject = await request(server, '/POOLSOLD/?project=alpha');
    const secondProject = await request(server, '/POOLSOLD/?project=beta');

    expect((await firstPool.json()).data[0].pool).toBe(
      '11111111-1111-4111-8111-111111111111'
    );
    expect((await secondPool.json()).data[0].pool).toBe(
      '22222222-2222-4222-8222-222222222222'
    );
    expect((await firstProject.json()).data[0].project).toBe('alpha');
    expect((await secondProject.json()).data[0].project).toBe('beta');
  });

  test('non-GET requests bypass the response cache', async () => {
    await request(server, '/pools', { method: 'HEAD' });

    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
