const { arbitrum } = require('../paraspace-lending-v1/address');

const project = 'sommelier';

// Ethereum Addresses
const defiStars = '0x03df2a53cbed19b824347d6a45d09016c2d1676a';
const realYieldUsd = '0x97e6e0a40a3d02f12d1cec30ebfbae04e37c119e';
const realYieldEth = '0xb5b29320d2dde5ba5bafa1ebcd270052070483ec';
const realYieldLINK = '0x4068bdd217a45f8f668ef19f1e3a1f043e4c4934';
const realYield1INCH = '0xc7b69e15d86c5c1581dacce3cacaf5b68cd6596f';
const realYieldUNI = '0x6a6af5393dc23d7e3db28d28ef422db7c40932b6';
const realYieldSNX = '0xcbf2250f33c4161e18d4a2fa47464520af5216b5';
const realYieldENS = '0x18ea937aba6053bc232d9ae2c42abe7a8a2be440';
const fraximal = '0xdbe19d1c3f21b1bb250ca7bdae0687a97b5f77e6';
const realYieldBtc = '0x0274a704a6d9129f90a62ddc6f6024b33ecdad36';
const turbosweth = '0xd33dad974b938744dac81fe00ac67cb5aa13958e';
const turbogho = '0x0c190ded9be5f512bd72827bdad4003e9cc7975c';
const ethgrowth = '0x6c51041a91c91c86f3f08a72cb4d3f67f1208897';
const turbosteth = '0xfd6db5011b171b05e1ea3b92f9eacaeeb055e971';
const turbosomm = '0x5195222f69c5821f8095ec565e71e18ab6a2298f';
const turboeeth = '0x9a7b4980C6F0FCaa50CD5f288Ad7038f434c692e';
const turbostethstethDeposit = '0xc7372Ab5dd315606dB799246E8aA112405abAeFf';
const morphomaximiser = '0xcf4B531b4Cde95BD35d71926e09B2b54c564F5b6';
const turbodiveth = '0x6c1edce139291Af5b84fB1e496c9747F83E876c9';
const turboethx = '0x19B8D8FC682fC56FbB42653F68c7d48Dd3fe597E';
const turboeethv2 = '0xdAdC82e26b3739750E036dFd9dEfd3eD459b877A';
const turborseth = '0x1dffb366b5c5A37A12af2C127F31e8e0ED86BDbe';
const turboezeth = '0x27500de405a3212d57177a789e30bb88b0adbec5';

// Arbitrum addresses
const realYieldEth_arbitrum = '0xC47bB288178Ea40bF520a91826a3DEE9e0DbFA4C';
const realYieldUsd_arbitrum = '0x392B1E6905bb8449d26af701Cdea6Ff47bF6e5A8';

// Optimism addresses
const realYieldEth_optimism = "0xC47bB288178Ea40bF520a91826a3DEE9e0DbFA4C"

// Rewards on ethereum are paid out in EVM SOMM
const ethRewardTokens = ['0xa670d7237398238de01267472c6f13e5b8010fd1'];


// Rewards on arbitrum are paid out in axlSOMM
const arbitrumRewardTokens = ['0x4e914bbDCDE0f455A8aC9d59d3bF739c46287Ed2'];


// Rewards on optimism are paid out in axlSOMM
const optimismRewardTokens = ['0x4e914bbDCDE0f455A8aC9d59d3bF739c46287Ed2'];

// Map of Cellars -> Staking Pool
const stakingPools = {
  ethereum: {
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
    [realYieldBtc]: '0x1eff374fd9aa7266504144da861fff9bbd31828e',
    [defiStars]: '0x0349b3c56adb9e39b5d75fc1df52eee313dd80d1',
    [fraximal]: '0x290a42e913083edf5aefb241f8a12b306c19f8f9',
    [turbosweth]: '0x69374d81fdc42add0fe1dc655705e40b51b6681b',
    [turbogho]: '0x6e5bb558d6c33ca45dc9efe0746a3c80bc3e70e1',
    [ethgrowth]: '0xb1D3948F4DCd7Aa5e89449080F3D88870aD0137A',
    // TODO: If we add staking pool for turbo steth, add it here
    // TODO: If we add staking pool for turbo somm, add it here
    [turboeeth]: '0x596c3f05ba9c6c356527e47989b3ed26e2b3449d',
    // TODO: If we add staking pool for turbo steth (steth deposit), add it here
    [morphomaximiser]: '0xe468c1156d4b3399e4Aa1080c58fFBc6119722F9',
    // TODO: If we add staking pool for turbo diveth, add it here
    [turboethx]: '0x88EDf544b5d4Ba6A11D40375e4bAEf3f1Ec5aF11',
    // TODO: If we add staking pool for turbo eethv2, add it here
    [turborseth]: '0xC6b423E3D25e6B36ab60Fa2c91FF344877F8Ead2',
    [turboezeth]: '0x4705F50b9c6CdffC6528ba6B3754106eE820997E',
  },
  arbitrum: {
    [realYieldEth_arbitrum]: '0xd700D39be88fB6b54311f95cCA949C3f6835e236',
    [realYieldUsd_arbitrum]: '0x623987D3CC0d504782bc99BBAc7965fe54917D7D',

    

  },
  optimism: {
    [realYieldEth_optimism]: '0xd700D39be88fB6b54311f95cCA949C3f6835e236',
  },
};

// List of v0815 Cellars
const v0815Pools = [
  {
    pool: '0x7bad5df5e11151dc5ee1a648800057c5c934c0d5-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'USDC',
    poolMeta: 'aave2-CLR-S',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/AAVE/manage',
  },
];

// List of v0816 Cellars
const v0816Pools = [
  {
    pool: '0x6b7f87279982d919bbf85182ddeab179b366d8f2-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'ETH-BTC',
    poolMeta: 'ETHBTCTrend',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/ETH-BTC-Trend',
  },
  {
    pool: '0x6e2dac3b9e9adc0cbbae2d0b9fd81952a8d33872-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'ETH-BTC',
    poolMeta: 'ETHBTCMom',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/ETH-BTC-Momentum',
  },
  {
    pool: '0x3f07a84ecdf494310d397d24c1c78b041d2fa622-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'ETH',
    poolMeta: 'SteadyETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-ETH',
  },
  {
    pool: '0x4986fd36b6b16f49b43282ee2e24c5cf90ed166d-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'BTC',
    poolMeta: 'SteadyBTC',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-BTC',
  },
  {
    pool: '0x6f069f711281618467dae7873541ecc082761b33-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'UNI',
    poolMeta: 'SteadyUNI',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-UNI',
  },
  {
    pool: '0x05641a27c82799aaf22b436f20a3110410f29652-ethereum',
    chain: 'ethereum',
    project,
    symbol: 'MATIC',
    poolMeta: 'SteadyMATIC',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Steady-MATIC',
  },
];

const v2Pools = [
  {
    pool: `${defiStars}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'USDC-CRV-AAVE-COMP-MKR-LDO',
    poolMeta: 'DeFiStars',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/DeFi-Stars',
  },
  {
    pool: `${realYieldUsd}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'USDC-USDT-DAI',
    poolMeta: 'RealYieldUSD',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-USD',
  },
  {
    pool: `${realYieldEth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-stETH-cbETH-rETH',
    poolMeta: 'RealYieldETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-ETH',
  },
  {
    pool: `${realYieldLINK}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'LINK-WETH-YieldETH',
    poolMeta: 'RealYieldLINK',
    tvlUsd: 0,
    apyBase: 0,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-LINK',
  },
  {
    pool: `${realYield1INCH}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: '1INCH-WETH-YieldETH',
    poolMeta: 'RealYield1INCH',
    tvlUsd: 0,
    apyBase: 0,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-1Inch',
  },
  {
    pool: `${realYieldUNI}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'UNI-WETH-YieldETH',
    poolMeta: 'RealYield1UNI',
    tvlUsd: 0,
    apyBase: 0,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-UNI',
  },
  {
    pool: `${realYieldSNX}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'SNX-WETH-YieldETH',
    poolMeta: 'RealYieldSNX',
    tvlUsd: 0,
    apyBase: 0,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-SNX',
  },
  {
    pool: `${realYieldENS}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'ENS-WETH-YieldETH',
    poolMeta: 'RealYieldENS',
    tvlUsd: 0,
    apyBase: 0,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-ENS',
  },
  {
    pool: `${fraximal}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'FRAX',
    poolMeta: 'Fraximal',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Fraximal',
  },
  {
    pool: `${realYieldBtc}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WBTC',
    poolMeta: 'RealYieldBTC',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Real-Yield-BTC',
  },
];

const v2p5Pools = [
  {
    pool: `${turbosweth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-SWETH',
    poolMeta: 'TurboSWETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-SWETH',
  },
  {
    pool: `${turbogho}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'GHO-USDC-USDT-DAI-LUSD',
    poolMeta: 'TurboGHO',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-GHO',
  },
  {
    pool: `${turbosteth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-STETH-WSTETH',
    poolMeta: 'TurboSTETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-STETH',
  },
  {
    pool: `${ethgrowth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'USDC-YieldUSD-YieldETH',
    poolMeta: 'ETH Trend Growth',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/ETH-Trend-Growth',
  },
  // {
  //   pool: `${turbosomm}-ethereum`,
  //   chain: 'ethereum',
  //   project,
  //   symbol: 'SOMM-WETH',
  //   poolMeta: 'TurboSOMM',
  //   tvlUsd: 0,
  //   apyBase: 0,
  //   apyReward: 0,
  //   rewardTokens: ethRewardTokens,
  //   underlyingTokens: [],
  //   url: 'https://app.sommelier.finance/strategies/Turbo-SOMM',
  // },
  {
    pool: `${turboeeth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-EETH',
    poolMeta: 'TurboEETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-eETH',
  },
  {
    pool: `${turbostethstethDeposit}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'STETH-WSTETH-WETH',
    poolMeta: 'TurboSTETH(stETHDeposit)',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-STETH-(steth-deposit)',
  },
];

// Minor version upgrade post v2p5, these require manually setting the underlying tokens
const v2p6Pools = [
  {
    pool: `${morphomaximiser}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-STETH-WSTETH',
    poolMeta: 'MorphoMaximiser',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
      '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    ],
    url: 'https://app.sommelier.finance/strategies/Morpho-ETH/manage',
  },
  {
    pool: `${turbodiveth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'RETH_BPT-WETH-RETH',
    poolMeta: 'TurboDivETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [
      '0x1E19CF2D73a72Ef1332C882F20534B6519Be0276',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0xae78736Cd615f374D3085123A210448E74Fc6393',
    ],
    url: 'https://app.sommelier.finance/strategies/Turbo-divETH/manage',
  },
  {
    pool: `${turboethx}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'ETHx-WETH-wstETH',
    poolMeta: 'TurboETHx',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [
      '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    ],
    url: 'https://app.sommelier.finance/strategies/Turbo-ETHx/manage',
  },
  {
    pool: `${turboeethv2}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-EETH-WEETH',
    poolMeta: 'TurboEETHv2',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-eETHV2/manage',
  },
  {
    pool: `${realYieldEth_arbitrum}-arbitrum`,
    chain: 'arbitrum',
    project,
    symbol: 'WETH-wstETH-cbETH-rETH',
    poolMeta: 'RealYieldETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: arbitrumRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/real-yield-eth-arb',
  },
  {
    pool: `${realYieldUsd_arbitrum}-arbitrum`,
    chain: 'arbitrum',
    project,
    symbol: 'USDC-USDC.e-USDT-DAI',
    poolMeta: 'RealYieldUSD',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: arbitrumRewardTokens,
    underlyingTokens: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8","0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"],
    url: 'https://app.sommelier.finance/strategies/real-yield-usd-arb',
  },
  {
    pool: `${turborseth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-RSETH',
    poolMeta: 'TurborsETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-rsETH/manage',
  },
  {
    pool: `${turboezeth}-ethereum`,
    chain: 'ethereum',
    project,
    symbol: 'WETH-EZETH',
    poolMeta: 'TurboezETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: ethRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/Turbo-ezETH/manage',
  },
  {
    pool: `${realYieldEth_optimism}-optimism`,
    chain: 'optimism',
    project,
    symbol: 'WETH-wstETH-cbETH-rETH',
    poolMeta: 'RealYieldETH',
    tvlUsd: 0,
    apyBase: 0,
    apyReward: 0,
    rewardTokens: optimismRewardTokens,
    underlyingTokens: [],
    url: 'https://app.sommelier.finance/strategies/real-yield-eth-opt/manage',
  },
];

module.exports = {
  project,
  rewardTokens: ethRewardTokens,
  stakingPools,
  v0815Pools,
  v0816Pools,
  v2Pools,
  v2p5Pools,
  v2p6Pools,
  realYieldEth,
};
