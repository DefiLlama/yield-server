// Network boundaries are mocked; exercise the real Superform adapter.
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
jest.mock('@defillama/sdk', () => ({ api: { abi: { multiCall: jest.fn() } } }));
jest.mock('../utils', () => ({
  getData: jest.fn(), getBlocksByTime: jest.fn(), getPriceApiData: jest.fn(),
  formatChain: (chain) => chain[0].toUpperCase() + chain.slice(1),
  keepFinite: (pool) => Number.isFinite(pool.tvlUsd) && Number.isFinite(pool.apyBase),
}));
jest.mock('../merkl/merkl-additional-reward', () => ({
  addMerklRewardApy: jest.fn(async (pools) => pools),
}));
const { apy } = require('./index');
const katana = '0x1d3f3041c8f8dc6aea7e1eebe4a24fafc3dfd634';
const asset = '0x203a662b0bd271a6ed5a60edfbd04bfce608fd36';
const reward = '0x2c71f70e2ec720ae061ae7e0316fc9654d94f417';
const existing = [
  ['1', 'ethereum', '0xf6ebea08a0dfd44825f67fa9963911c81be2a947'],
  ['8453', 'base', '0x11820afe50ea96851ee2bdbae329d97771e41ec6'],
  ['14', 'flare', '0xb7c1c8f7191c7d76b5c6650a6fb20f6f8027bf0d'],
];

beforeEach(() => {
  jest.clearAllMocks();
  utils.getData.mockResolvedValue({ supervaults: [
    ...existing.map(([chain_id, , address]) => ({ chain_id, address, symbol: 'existing' })),
    { chain_id: '747474', address: katana, symbol: 'katanaUSDC',
      stats_basic: { apy_snapshot_week: 999 }, // Must not become organic APY.
      rewards: [
        { type: 'token', address: reward, reward_rate: 2.5 },
        { type: 'points', address: reward, reward_rate: 99 },
      ] },
  ] });
  utils.getBlocksByTime.mockResolvedValue([200, 100]);
  sdk.api.abi.multiCall.mockImplementation(async ({ abi, calls, block }) => ({
    output: calls.map((input) => ({ input, success: true, output:
      abi === 'address:asset' ? asset : abi === 'uint8:decimals' ? '6' :
      abi === 'uint256:totalAssets' ? (block === 100 ? '100000000' : '100100000') : '100000000'
    })),
  }));
  utils.getPriceApiData.mockImplementation(async () => ({ coins: Object.fromEntries(
    ['ethereum', 'base', 'flare', 'katana'].map(c => [`${c}:${asset}`, { price: 1 }])
  ) }));
});

test('discovers Katana without changing existing chains or double counting reward APY', async () => {
  const pools = await apy();
  const pool = pools.find(p => p.pool === `superform-${katana}-katana`);
  expect(pool).toBeDefined();
  expect(pools).toHaveLength(4);
  expect(pool.chain).toBe('Katana');
  expect(pool.tvlUsd).toBeCloseTo(100.1);
  expect(pool.apyBase).toBeCloseTo((Math.pow(1.001, 365 / 7) - 1) * 100);
  expect(pool.apyReward).toBe(2.5);
  expect(pool.rewardTokens).toEqual([reward]);
  for (const [, chain, address] of existing) {
    const previous = pools.find(p => p.pool === `superform-${address}-${chain}`);
    expect(previous.tvlUsd).toBe(pool.tvlUsd);
    expect(previous.apyBase).toBe(pool.apyBase);
    expect(previous.apyReward).toBeUndefined();
  }
  expect(addMerklRewardApy).toHaveBeenCalledTimes(1);
});
