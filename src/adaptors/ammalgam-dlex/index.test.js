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
const WEEK_START_BLOCK = 26000000;
const DAY_START_BLOCK = 26000001;
const END_BLOCK = 26000002;

describe('ammalgam-dlex APY', () => {
  beforeEach(() => {
    utils.getBlocksByTime.mockResolvedValue([
      WEEK_START_BLOCK,
      DAY_START_BLOCK,
      END_BLOCK,
    ]);
    utils.getPriceApiData.mockResolvedValue({
      coins: {
        [`ethereum:${USDC}`]: { price: 1 },
        [`ethereum:${USDT}`]: { price: 1 },
        [`ethereum:${WETH}`]: { price: 1000 },
      },
    });
    sdk.getEventLogs.mockResolvedValue([]);
    sdk.api.abi.call.mockImplementation(async ({ target, abi, block }) => {
      if (target !== FIRST_PAIR) throw new Error('Pool omitted from fixture');

      const isCurrent = block === END_BLOCK;
      if (abi.includes('totalAssetsAndShares')) {
        return {
          output: {
            _allAssets: [
              '40000000000000',
              '0',
              '0',
              '30000000000000',
              '0',
              '0',
            ],
            _allShares: ['40000000000000', '0', '0', '0', '0', '0'],
          },
        };
      }

      return {
        output: {
          reserveXAssets: isCurrent ? '400400000' : '400000000',
          reserveYAssets: isCurrent
            ? '250250000000000000'
            : '250000000000000000',
        },
      };
    });
    sdk.api.abi.multiCall.mockResolvedValue({
      output: [{ output: '1000000000' }, { output: '1000000000000000000' }],
    });
  });

  test('applies reserve growth only to unborrowed L', async () => {
    const [pool] = await adapter.apy(1800000000);

    // Active L is 25% of deposits. Its 0.1% reserve growth therefore moves the
    // adjusted share value by only 0.025%; borrowed L gets no swap growth.
    expect(pool.apyBase).toBeCloseTo(9.553036285763717);
    expect(pool.apyBase7d).toBeCloseTo(1.3119399040193214);
    expect(pool.pricePerShare).toBeCloseTo(1, 10);
  });
});
