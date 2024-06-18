// -- Project

const UMAMI_GRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/umamidao/protocol-metrics';
const UMAMI_API_URL = 'https://api.umami.finance/api/v2';

const UMAMI_ADDRESS = '0x1622bf67e6e5747b81866fe0b85178a93c7f86e3';
const mUMAMI_ADDRESS = '0x2adabd6e8ce3e82f52d9998a7f64a90d294a92a4';
const cmUMAMI_ADDRESS = '0x1922c36f3bc762ca300b4a46bb2102f84b1684ab';
const wETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const ARB_ADDRESS = '0x912ce59144191c1204e64559fe8253a0e49e6548';

// -- GLP Vaults

const UMAMI_GLP_VAULTS = [
  {
    id: 'glpusdc',
    symbol: 'glpUSDC',
    decimals: 6,
    underlyingAsset: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
    address: '0x727ed4ef04bb2a96ec77e44c1a91dbb01b605e42',
  },
  {
    id: 'glpweth',
    symbol: 'glpWETH',
    decimals: 18,
    underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
    address: '0xbb84d79159d6bbe1de148dc82640caa677e06126',
  },
  {
    id: 'glpwbtc',
    symbol: 'glpWBTC',
    decimals: 8,
    underlyingAsset: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // WBTC
    address: '0x6a89faf99587a12e6bb0351f2fa9006c6cd12257',
  },
  {
    id: 'glplink',
    symbol: 'glpLINK',
    decimals: 18,
    underlyingAsset: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', // LINK
    address: '0xe0a21a475f8da0ee7fa5af8c1809d8ac5257607d',
  },
  {
    id: 'glpuni',
    symbol: 'glpUNI',
    decimals: 18,
    underlyingAsset: '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0', // UNI
    address: '0x37c0705a65948ea5e0ae1add13552bcad7711a23',
  },
];

// -- GM Vaults

const GM_USDC = '0x959f3807f0aa7921e18c78b00b2819ba91e52fef';
const GM_WETH = '0x4bca8d73561aaeee2d3a584b9f4665310de1dd69';

const ARB_MASTER_CHEF = '0x52f6159dcae4ce617a3d50aeb7fab617526d9d8f';
const GMI_AGGREGATE_VAULT = '0x0ca62954b46afee430d645da493c6c783448c4ed';

// This vault holds the GMX GM tokens for the GM vaults
const GMI_VAULT = '0x9d2f33af8610f1b53dd6fce593f76a2b4b402176';

const UMAMI_GM_VAULTS = [
  {
    id: 'gmusdc',
    symbol: 'gmUSDC',
    address: GM_USDC,
    underlyingAsset: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
    decimals: 6,
    underlyingGmMarkets: [
      '0x70d95587d40a2caf56bd97485ab3eec10bee6336', // WETH/USD
      '0x0ccb4faa6f1f1b30911619f1184082ab4e25813c', // XRP/USD
      '0x6853ea96ff216fab11d2d930ce3c508556a4bdc4', // DOGE/USD
      '0xd9535bb5f58a1a75032416f2dfe7880c30575a41', // LTC/USD
    ],
  },
  {
    id: 'gmweth',
    symbol: 'gmWETH',
    address: GM_WETH,
    underlyingAsset: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
    decimals: 18,
    underlyingGmMarkets: [
      '0x70d95587d40a2caf56bd97485ab3eec10bee6336', // WETH/USD
      '0x0ccb4faa6f1f1b30911619f1184082ab4e25813c', // XRP/USD
      '0x6853ea96ff216fab11d2d930ce3c508556a4bdc4', // DOGE/USD
      '0xd9535bb5f58a1a75032416f2dfe7880c30575a41', // LTC/USD
    ],
  },
];

module.exports = {
  wETH_ADDRESS,
  UMAMI_GRAPH_URL,
  UMAMI_API_URL,
  UMAMI_ADDRESS,
  mUMAMI_ADDRESS,
  cmUMAMI_ADDRESS,
  UMAMI_GLP_VAULTS,
  UMAMI_GM_VAULTS,
  GMI_VAULT,
  GM_USDC,
  GM_WETH,
  ARB_MASTER_CHEF,
  ARB_ADDRESS,
  GMI_AGGREGATE_VAULT,
};
