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

// Common token addresses - Ethereum Mainnet
const tokens = {
  ethereum: {
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    DAI: '0x6b175474e89094c44da98b954eeadc7c9caa3c2c',
    WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    stETH: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    wstETH: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
    cbETH: '0xbe9895146f7af43049ca1c1ae358b0541ea49704',
    rETH: '0xae78736cd615f374d3085123a210448e74fc6393',
    LINK: '0x514910771af9ca656af840dff83e8264ecf986ca',
    '1INCH': '0x111111111117dc0aa78b770fa6a738034120c302',
    UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    SNX: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    ENS: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
    FRAX: '0x853d955acef822db058eb8505911ed77f175b99e',
    CRV: '0xd533a949740bb3306d119cc777fa900ba034cd52',
    AAVE: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    COMP: '0xc00e94cb662c3520282e6f5717214004a7f26888',
    MKR: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
    LDO: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    SWETH: '0xf951e335afb289353dc249e82926178eac7ded78',
    GHO: '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f',
    LUSD: '0x5f98805a4e8be255a32880fdec7f6728c6568ba0',
    eETH: '0x35fa164735182de50811e8e2e824cfb9b6118ac2',
    weETH: '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee',
    rsETH: '0xa1290d69c65a6fe4df752f95823fae25cb99e5a7',
    ezETH: '0xbf5495efe5db9ce00f80364c8b423567e58d2110',
    ETHx: '0xa35b1b31ce002fbf2058d22f30f95d405200a15b',
    MATIC: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
  },
  arbitrum: {
    WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    wstETH: '0x5979d7b546e38e414f7e9822514be443a4800529',
    rETH: '0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8',
  },
  optimism: {
    WETH: '0x4200000000000000000000000000000000000006',
    wstETH: '0x1f32b1c2345538c0c6f582fcb022739c4a194ebb',
    rETH: '0x9bcef72be871e61ed4fbbc7630889bee758eb81d',
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
    underlyingTokens: [tokens.ethereum.USDC],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.WBTC],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.WBTC],
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
    underlyingTokens: [tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum.WBTC],
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
    underlyingTokens: [tokens.ethereum.UNI],
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
    underlyingTokens: [tokens.ethereum.MATIC],
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
    underlyingTokens: [tokens.ethereum.USDC, tokens.ethereum.CRV, tokens.ethereum.AAVE, tokens.ethereum.COMP, tokens.ethereum.MKR, tokens.ethereum.LDO],
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
    underlyingTokens: [tokens.ethereum.USDC, tokens.ethereum.USDT, tokens.ethereum.DAI],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.stETH, tokens.ethereum.cbETH, tokens.ethereum.rETH],
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
    underlyingTokens: [tokens.ethereum.LINK, tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum['1INCH'], tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum.UNI, tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum.SNX, tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum.ENS, tokens.ethereum.WETH],
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
    underlyingTokens: [tokens.ethereum.FRAX],
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
    underlyingTokens: [tokens.ethereum.WBTC],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.SWETH],
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
    underlyingTokens: [tokens.ethereum.GHO, tokens.ethereum.USDC, tokens.ethereum.USDT, tokens.ethereum.DAI, tokens.ethereum.LUSD],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.stETH, tokens.ethereum.wstETH],
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
    underlyingTokens: [tokens.ethereum.USDC],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.eETH],
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
    underlyingTokens: [tokens.ethereum.stETH, tokens.ethereum.wstETH, tokens.ethereum.WETH],
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
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
      '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
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
      '0x1e19cf2d73a72ef1332c882f20534b6519be0276',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      '0xae78736cd615f374d3085123a210448e74fc6393',
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
      '0xa35b1b31ce002fbf2058d22f30f95d405200a15b',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.eETH, tokens.ethereum.weETH],
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
    underlyingTokens: [tokens.arbitrum.WETH, tokens.arbitrum.wstETH, tokens.arbitrum.rETH],
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
    underlyingTokens: ["0xaf88d065e77c8cc2239327c5edb3a432268e5831","0xff970a61a04b1ca14834a43f5de4533ebddb5cc8","0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9","0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.rsETH],
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
    underlyingTokens: [tokens.ethereum.WETH, tokens.ethereum.ezETH],
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
    underlyingTokens: [tokens.optimism.WETH, tokens.optimism.wstETH, tokens.optimism.rETH],
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
