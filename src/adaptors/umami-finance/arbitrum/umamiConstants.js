// -- Project

const wETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const WBTC_ADDRESS = '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f';
const ARB_ADDRESS = '0x912ce59144191c1204e64559fe8253a0e49e6548';

const REWARD_TOKEN_ADDRESS = ARB_ADDRESS;

const MASTER_CHEF = '0x52f6159dcae4ce617a3d50aeb7fab617526d9d8f';

const GM_MARKETS = [
  {
    // ETH/USD
    indexTokenName: 'ETH',
    longTokenName: 'ETH',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0x70d95587d40a2caf56bd97485ab3eec10bee6336',
  },
  {
    // XRP/USD
    indexTokenName: 'XRP',
    longTokenName: 'ETH',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0x0ccb4faa6f1f1b30911619f1184082ab4e25813c',
  },
  {
    // DOGE/USD
    indexTokenName: 'DOGE',
    longTokenName: 'ETH',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0x6853ea96ff216fab11d2d930ce3c508556a4bdc4',
  },
  {
    // LTC/USD
    indexTokenName: 'LTC',
    longTokenName: 'ETH',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0xd9535bb5f58a1a75032416f2dfe7880c30575a41',
  },
  {
    // WBTC/USD
    indexTokenName: 'BTC',
    longTokenName: 'BTC',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0x47c031236e19d024b42f8ae6780e44a573170703',
  },
];

// ----  GM Synth Vaults ----

const GM_USDC = '0x959f3807f0aa7921e18c78b00b2819ba91e52fef'; // USDC part of the GMX GM synthetics pools (backed by ETH/USDC)
const GM_WETH = '0x4bca8d73561aaeee2d3a584b9f4665310de1dd69'; // WETH part of the GMX GM synthetics pools (backed by ETH/USDC)

// This vault holds the GMX GM tokens for the Synth GM vaults
const GMI_VAULT = '0x9d2f33af8610f1b53dd6fce593f76a2b4b402176';
const GMI_AGGREGATE_VAULT = '0x0ca62954b46afee430d645da493c6c783448c4ed';

const UMAMI_SYNTH_GM_VAULTS = [
  {
    id: 'gmusdc',
    symbol: 'gmUSDC',
    address: GM_USDC,
    underlyingAsset: USDC_ADDRESS,
    decimals: 6,
    underlyingGmMarkets: [
      GM_MARKETS[0],
      GM_MARKETS[1],
      GM_MARKETS[2],
      GM_MARKETS[3],
    ],
    masterchefLpId: 0n,
    aggregateVaultAddress: GMI_AGGREGATE_VAULT,
    url: 'https://umami.finance/vaults/arbitrum/gm/gmusdc',
  },
  {
    id: 'gmweth',
    symbol: 'gmWETH',
    address: GM_WETH,
    underlyingAsset: wETH_ADDRESS,
    decimals: 18,
    underlyingGmMarkets: [
      GM_MARKETS[0],
      GM_MARKETS[1],
      GM_MARKETS[2],
      GM_MARKETS[3],
    ],
    masterchefLpId: 1n,
    aggregateVaultAddress: GMI_AGGREGATE_VAULT,
    url: 'https://umami.finance/vaults/arbitrum/gm/gmweth',
  },
];

// ----  GM Assets Vaults ----

const GM_USDC_WBTC = '0x5f851f67d24419982ecd7b7765defd64fbb50a97'; // USDC part of the GMX GM USDC-WBTC pool
const GM_WBTC = '0xcd8011aab161a75058eab24e0965bab0b918af29'; // WBTC part of the GMX GM USDC-WBTC pool

// Hold GM tokens for GM vaults

const GM_GMI_CONTRACT_ADDRESS = '0xb472fdfd589f404b4cf4f76baf7e5286cbc39790';
const GM_WBTC_AGGREGATE_VAULT_ADDRESS =
  '0x1e914730b4cd343ae14530f0bbf6b350d83b833d';

const UMAMI_GM_VAULTS = [
  {
    id: 'gmusdc',
    symbol: 'gmUSDC (wBTC)',
    address: GM_USDC_WBTC,
    underlyingAsset: USDC_ADDRESS,
    decimals: 6,
    underlyingGmMarkets: [GM_MARKETS[4]],
    masterchefLpId: 3n,
    aggregateVaultAddress: GM_WBTC_AGGREGATE_VAULT_ADDRESS,
    url: 'https://umami.finance/vaults/arbitrum/gm/gmusdc_wbtc',
  },
  {
    id: 'gmwbtc',
    symbol: 'gmWBTC',
    address: GM_WBTC,
    underlyingAsset: WBTC_ADDRESS,
    decimals: 8,
    underlyingGmMarkets: [GM_MARKETS[4]],
    masterchefLpId: 2n,
    aggregateVaultAddress: GM_WBTC_AGGREGATE_VAULT_ADDRESS,
    url: 'https://umami.finance/vaults/arbitrum/gm/gmwbtc',
  },
];

module.exports = {
  UMAMI_SYNTH_GM_VAULTS,
  UMAMI_GM_VAULTS,
  GMI_VAULT,
  GM_MARKETS,
  GM_USDC,
  GM_WETH,
  MASTER_CHEF,
  REWARD_TOKEN_ADDRESS,
  GMI_AGGREGATE_VAULT,
  GM_GMI_CONTRACT_ADDRESS,
  GM_WBTC_AGGREGATE_VAULT_ADDRESS,
};
