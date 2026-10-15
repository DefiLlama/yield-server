const sdk = require('@defillama/sdk');
const utils = require('../utils');

jest.mock('@defillama/sdk', () => ({
  api: {
    abi: {
      call: jest.fn(),
      multiCall: jest.fn(),
    },
  },
  getEventLogs: jest.fn(),
}));

jest.mock('../utils', () => ({
  formatChain: jest.fn(() => 'Ethereum'),
  getBlocksByTime: jest.fn(),
  getPriceApiData: jest.fn(),
  keepFinite: jest.fn(() => true),
}));

const adapter = require('./index');

const FIRST_PAIR = '0x728fd0a966b993fe518b00122d51e494f99abd6a';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

describe('ammalgam-dlex liquidity reporting', () => {
  let pool;

  beforeAll(async () => {
    utils.getBlocksByTime.mockResolvedValue([26000000, 26000001, 26000002]);
    utils.getPriceApiData.mockResolvedValue({
      coins: {
        [`ethereum:${USDC}`]: { price: 1 },
        [`ethereum:${USDT}`]: { price: 1 },
        [`ethereum:${WETH}`]: { price: 1000 },
      },
    });
    sdk.getEventLogs.mockResolvedValue([]);
    sdk.api.abi.call.mockImplementation(async ({ target, abi }) => {
      if (target !== FIRST_PAIR) throw new Error('Pool omitted from fixture');

      if (abi.includes('totalAssetsAndShares')) {
        return {
          output: {
            _allAssets: [
              '200',
              '10000000',
              '10000000000000000',
              '100',
              '5000000',
              '5000000000000000',
            ],
            _allShares: ['200', '0', '0', '0', '0', '0'],
          },
        };
      }

      return {
        output: {
          reserveXAssets: '60000000',
          reserveYAssets: '40000000000000000',
        },
      };
    });
    sdk.api.abi.multiCall.mockResolvedValue({
      output: [{ output: '70000000' }, { output: '50000000000000000' }],
    });

    [pool] = await adapter.apy(1800000000);
  });

  test('uses pair token balances for tvlUsd', () => {
    expect(pool.tvlUsd).toBeCloseTo(120);
  });

  test('includes liquidity and single-asset deposits in totalSupplyUsd', () => {
    expect(pool.totalSupplyUsd).toBeCloseTo(220);
  });

  test('includes borrowed liquidity and single-asset borrows in totalBorrowUsd', () => {
    expect(pool.totalBorrowUsd).toBeCloseTo(110);
  });
});
