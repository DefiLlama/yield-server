jest.mock('../utils', () => ({
  getData: jest.fn(),
  getPrices: jest.fn(),
  withRetry: (read) => read(),
  formatChain: () => 'Aleo',
  keepFinite: (row) =>
    Number.isFinite(row.apyBase) && Number.isFinite(row.tvlUsd),
}));

const utils = require('../utils');
const adapter = require('./index');

const key = 'pool-key';
const pool = {
  key,
  enabled: true,
  token0: '469661199361043738096225field',
  token1:
    '212707628815602939926313406778312270053663804591730917421274098438979020915field',
  token0_info: { symbol: 'wBTC', decimals: 8 },
  token1_info: { symbol: 'USDCx', decimals: 6 },
};

const run = async (fee24h) => {
  utils.getPrices.mockResolvedValue({
    pricesByAddress: { bitcoin: 100000, 'usd-coin': 1 },
  });
  utils.getData.mockImplementation(async (url) => {
    if (url.endsWith('/pools')) return { data: [pool] };
    if (url.includes('/pools/stats?'))
      return {
        data: {
          [key]: {
            reserve0: '100000000',
            reserve1: '100000000',
            volume_24h: '100000000',
            fee_24h: fee24h,
          },
        },
      };
    if (url.includes('/mapping/pool_metadata/')) return '{ fee: 800u16 }';
    if (url.includes('/mapping/pools/')) return '{ fee: 200u16 }';
    if (url.includes('/mapping/slots/')) return '{ fee_protocol: 8u8 }';
    throw new Error(`Unexpected URL: ${url}`);
  });
  return adapter.apy();
};

test('uses current fee metadata and realized LP fees without deducting protocol fees again', async () => {
  // The creation fee is stale. Realized fees already include discounts and the protocol cut.
  // 123 satoshis at $100,000/BTC = $0.123 in LP fees, on $100,100 TVL.
  const [result] = await run('123');
  expect(result.poolMeta).toBe('0.08%');
  expect(result.apyBase).toBeCloseTo(((0.123 * 365) / 100100) * 100, 12);
});

test.each([null, undefined, '', 'not-a-number', '-1'])(
  'omits pools with unavailable or invalid realized fees: %s',
  async (fee) => {
    expect(await run(fee)).toHaveLength(0);
  }
);

test('retains a genuine zero-fee day', async () => {
  const [result] = await run('0');
  expect(result.apyBase).toBe(0);
});
