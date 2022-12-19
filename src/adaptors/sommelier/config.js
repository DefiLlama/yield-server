const chain = 'ethereum';
const project = 'sommelier';

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
];

module.exports = {
  chain,
  project,
  rewardTokens,
  stakingPools,
  v0815Pools,
  v0816Pools,
};
