const UMAMI_GRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/umamidao/protocol-metrics';
const UMAMI_API_URL = 'https://api.umami.finance/api/v2';

const UMAMI_ADDRESS = '0x1622bf67e6e5747b81866fe0b85178a93c7f86e3';
const mUMAMI_ADDRESS = '0x2adabd6e8ce3e82f52d9998a7f64a90d294a92a4';
const cmUMAMI_ADDRESS = '0x1922c36f3bc762ca300b4a46bb2102f84b1684ab';
const wETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const UMAMI_ALL_VAULTS = [
  {
    id: 'glpusdc',
    symbol: 'glpUSDC',
    timelockSymbol: 'glpUSDCb',
    decimals: 6,
    underlyingAsset: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
    address: '0x727ed4ef04bb2a96ec77e44c1a91dbb01b605e42',
    timelockAddress: '0xdca4e88c00a8800ebcebad63abdbaaaa755557f9',
  },
  {
    id: 'glpweth',
    symbol: 'glpWETH',
    timelockSymbol: 'glpWETHb',
    decimals: 18,
    underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    address: '0xbb84d79159d6bbe1de148dc82640caa677e06126',
    timelockAddress: '0xf2ad33e12a9780f1e42d878a29a3e0756008c838',
  },
  {
    id: 'glpwbtc',
    symbol: 'glpWBTC',
    timelockSymbol: 'glpWBTCb',
    decimals: 8,
    underlyingAsset: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
    address: '0x6a89faf99587a12e6bb0351f2fa9006c6cd12257',
    timelockAddress: '0x83c19ec75d649aec7c99e2c6663ca055569da7c0',
  },
  {
    id: 'glplink',
    symbol: 'glpLINK',
    timelockSymbol: 'glpLINKb',
    decimals: 18,
    underlyingAsset: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
    address: '0xe0a21a475f8da0ee7fa5af8c1809d8ac5257607d',
    timelockAddress: '0xb0d9e1832bd973abd8f3b4d710ead21fcbefcb7c',
  },
  {
    id: 'glpuni',
    symbol: 'glpUNI',
    timelockSymbol: 'glpUNIb',
    decimals: 18,
    underlyingAsset: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0',
    address: '0x37c0705a65948ea5e0ae1add13552bcad7711a23',
    timelockAddress: '0xee57e7e3776e4868976f315e07a883955c9225d5',
  },
];

module.exports = {
  wETH_ADDRESS,
  UMAMI_GRAPH_URL,
  UMAMI_API_URL,
  UMAMI_ADDRESS,
  mUMAMI_ADDRESS,
  cmUMAMI_ADDRESS,
  UMAMI_ALL_VAULTS,
};
