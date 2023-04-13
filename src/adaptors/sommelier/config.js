const chain = 'ethereum';
const project = 'sommelier';

// Addresses
const realYieldUsd = '0x97e6e0a40a3d02f12d1cec30ebfbae04e37c119e';
const realYieldEth = '0xb5b29320d2dde5ba5bafa1ebcd270052070483ec';

// Rewards are paid out in EVM SOMM
const rewardTokens = ['0xa670d7237398238de01267472c6f13e5b8010fd1'];

// Map of Cellars -> Staking Pool
const stakingPools = {
  '0x7bad5df5e11151dc5ee1a648800057c5c934c0d5':
    '0x24691a00779d375A5447727E1610d327D04B3C5F',
  '0x3f07a84ecdf494310d397d24c1c78b041d2fa622':
    '0xae0e6024972b70601bc35405479af5cd372cc956',
  '0x4986fd36b6b16f49b43282ee2e24c5cf90ed166d':
    '0xd1d02c16874e0714fd825213e0c13eab6dd9c25f',
  '0x6b7f87279982d919bbf85182ddeab179b366d8f2':
    '0x9eeabfff5d15e8cedfd2f6c914c8826ba0a5fbbd',
  '0x6e2dac3b9e9adc0cbbae2d0b9fd81952a8d33872':
    '0x6ce314c39f30488b4a86b8892c81a5b7af83e337',
  '0x6f069f711281618467dae7873541ecc082761b33':
    '0x74a9a6fab61e128246a6a5242a3e96e56198cbdd',
  '0x05641a27c82799aaf22b436f20a3110410f29652':
    '0x7da7e27e4bcc6ec8bc06349e1cef6634f6df7c5c',
  [realYieldUsd]: '0x8510f22bd1932afb4753b6b3edf5db00c7e7a748',
  [realYieldEth]: '0x955a31153e6764fe892757ace79123ae996b0afb',
};

// List of v0815 Cellars
const v0815Pools = [
  {
    pool: '0x7bad5df5e11151dc5ee1a648800057c5c934c0d5-ethereum',
    chain,
    project,
    symbol: 'USDC',
    poolMeta: 'aave2-CLR-S',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/AAVE/manage',
  },
];

// List of v0816 Cellars
const v0816Pools = [
  {
    pool: '0x6b7f87279982d919bbf85182ddeab179b366d8f2-ethereum',
    chain,
    project,
    symbol: 'ETH-BTC',
    poolMeta: 'ETHBTCTrend',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/ETH-BTC-Trend',
  },
  {
    pool: '0x6e2dac3b9e9adc0cbbae2d0b9fd81952a8d33872-ethereum',
    chain,
    project,
    symbol: 'ETH-BTC',
    poolMeta: 'ETHBTCMom',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/ETH-BTC-Momentum',
  },
  {
    pool: '0x3f07a84ecdf494310d397d24c1c78b041d2fa622-ethereum',
    chain,
    project,
    symbol: 'ETH',
    poolMeta: 'SteadyETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-ETH',
  },
  {
    pool: '0x4986fd36b6b16f49b43282ee2e24c5cf90ed166d-ethereum',
    chain,
    project,
    symbol: 'BTC',
    poolMeta: 'SteadyBTC',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-BTC',
  },
  {
    pool: '0x6f069f711281618467dae7873541ecc082761b33-ethereum',
    chain,
    project,
    symbol: 'UNI',
    poolMeta: 'SteadyUNI',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-UNI',
  },
  {
    pool: '0x05641a27c82799aaf22b436f20a3110410f29652-ethereum',
    chain,
    project,
    symbol: 'MATIC',
    poolMeta: 'SteadyMATIC',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-MATIC',
  },
];

const v2Pools = [
  {
    pool: `${realYieldUsd}-ethereum`,
    chain,
    project,
    symbol: 'USDC-USDT-DAI',
    poolMeta: 'RealYieldUSD',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-USD',
  },
  {
    pool: `${realYieldEth}-ethereum`,
    chain,
    project,
    symbol: 'WETH-stETH-cbETH-rETH',
    poolMeta: 'RealYieldETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-ETH',
  },
];

module.exports = {
  chain,
  project,
  rewardTokens,
  stakingPools,
  v0815Pools,
  v0816Pools,
  v2Pools,
};
