const coins = {
  eth: ['0x0000000000000000000000000000000000000000', 'ethereum'],
  usdc: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'usd-coin'],
  usdt: ['0xdAC17F958D2ee523a2206206994597C13D831ec7', 'usd-coin'],
  dai: ['0x6b175474e89094c44da98b954eedeac495271d0f', 'dai'],
  wbtc: ['0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', 'bitcoin'],
  steth: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', 'staked-ether'],
  renBTC: ['0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D', 'renbtc'],

  crv: ['0xD533a949740bb3306d119CC777fa900bA034cd52', 'curve-dao-token'],
  cvxcrv: ['0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7', 'convex-crv'],

  frax: ['0x853d955aCEf822Db058eb8505911ED77F175b99e', 'frax'],
  cvx: ['0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', 'convex-finance'],
  fxs: ['0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0', 'frax-share'],
  crv3pool: ['0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490', 'lp-3pool-curve'],

  reth: ['0xae78736cd615f374d3085123a210448e74fc6393', 'rocket-pool-eth'],
  wstETH: ['0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', 'wrapped-steth'],
  'UST(Wormhole)': [
    '0xa693B19d2931d498c5B318dF961919BB4aee87a5',
    'terrausd-wormhole',
  ],
  'UST(Terra)': [
    '0xa47c8bf37f92aBed4A126BDA807A7b7498661acD',
    'terrausd-wormhole',
  ],
};

module.exports = [
  {
    symbol: 'ETH-stETH',
    name: 'steth',
    coins: [coins.eth, coins.steth],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
      lpToken: '0x06325440D014e39736583c165C2963BA99fAf14E',
    },
  },
  {
    symbol: 'FRAX-3Crv',
    name: 'frax',
    coins: [coins.frax, coins.crv3pool],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
      lpToken: '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
    },
  },
  {
    symbol: 'USDT-wBTC-WETH',
    name: 'tricrypto2',
    coins: [coins.usdt, coins.wbtc, coins.eth],
    coinDecimals: [6, 8, 18],
    addresses: {
      swap: '0xD51a44d3FaE010294C616388b506AcdA1bfAAE46',
      lpToken: '0xc4AD29ba4B3c580e6D59105FFf484999997675Ff',
    },
  },

  {
    symbol: 'cvxCRV-CRV',
    name: 'cvxcrv',
    coins: [coins.crv, coins.cvxcrv],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0x9D0464996170c6B9e75eED71c68B99dDEDf279e8',
      lpToken: '0x9D0464996170c6B9e75eED71c68B99dDEDf279e8',
    },
  },
  {
    symbol: 'ETH-CRV',
    name: 'crveth',
    coins: [coins.eth, coins.crv],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511',
      lpToken: '0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d',
    },
  },

  {
    symbol: 'ETH-CVX',
    name: 'cvxeth',
    coins: [coins.eth, coins.cvx],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4',
      lpToken: '0x3A283D9c08E8b55966afb64C515f5143cf907611',
    },
  },

  {
    symbol: 'FXS-cvxFXS',
    name: 'cvxfxs',
    coins: [coins.fxs, coins.fxs],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0xd658A338613198204DCa1143Ac3F01A722b5d94A',
      lpToken: '0xF3A43307DcAFa93275993862Aae628fCB50dC768',
    },
  },

  {
    symbol: 'DAI-USDC-USDT',
    name: '3pool',
    coins: [coins.dai, coins.usdc, coins.usdt],
    coinDecimals: [18, 6, 6],
    addresses: {
      swap: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
      lpToken: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
    },
  },

  {
    symbol: 'UST-3Crv',
    name: 'ust-wormhole',
    coins: [coins.ust, coins.crv3pool],
    coinDecimals: [6, 18],
    addresses: {
      swap: '0xCEAF7747579696A2F0bb206a14210e3c9e6fB269',
      lpToken: '0xCEAF7747579696A2F0bb206a14210e3c9e6fB269',
    },
  },

  {
    symbol: 'rETH-wstETH',
    name: 'RocketPoolETH',
    isShowEthApy: true,
    coins: [coins.rETH, coins.wstETH],
    coinDecimals: [18, 18],
    addresses: {
      swap: '0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08',
      lpToken: '0x447Ddd4960d9fdBF6af9a790560d0AF76795CB08',
    },
  },

  {
    symbol: 'renBTC-wBTC',
    name: 'ren',
    coins: [coins.renbtc, coins.wbtc],
    coinDecimals: [8, 8],
    addresses: {
      swap: '0x93054188d876f558f4a66B2EF1d97d16eDf0895B',
      lpToken: '0x49849C98ae39Fff122806C06791Fa73784FB3675',
    },
  },
  
  {
    symbol: 'PUSD-3Crv',
    name: 'pusd',
    coins: [
        coins.PUSD,
        coins.crv3pool
    ],
    coinDecimals: [18, 18],
    addresses: {
        swap: '0x8EE017541375F6Bcd802ba119bdDC94dad6911A1',
        lpToken: '0x8EE017541375F6Bcd802ba119bdDC94dad6911A1',
    },
},
];
