// -- Project

const wETH_ADDRESS = '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab';
const USDC_ADDRESS = '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e';

const REWARD_TOKEN_ADDRESS = undefined;

const MASTER_CHEF = ''; // TBD

const GM_MARKETS = [
  {
    // WETH/USD
    indexTokenName: 'ETH',
    longTokenName: 'ETH',
    shortTokenName: 'USDC',
    longToken: wETH_ADDRESS,
    shortToken: USDC_ADDRESS,
    address: '0xb7e69749e3d2edd90ea59a4932efea2d41e245d7',
  },
];

// ----  GM Synth Vaults ----

// This vault holds the GMX GM tokens for the Synth GM vaults
const GMI_VAULT = ''; // TBD
const GMI_AGGREGATE_VAULT = ''; // TBD

const UMAMI_SYNTH_GM_VAULTS = [
  // TBD
];

// ----  GM Assets Vaults ----

const GM_USDC_WETH = '0x4f3274c3889e6cd54c9c739757ab8ea4b246d76b'; // USDC part of the GMX GM USDC-WETH pool
const GM_WETH = '0xfce0a462585a422bac0ca443b102d0ac1ff20f9e'; // WETH part of the GMX GM USDC-WETH pool

// Hold GM tokens for GM vaults

const GM_GMI_CONTRACT_ADDRESS = '0x4ba2396086d52ca68a37d9c0fa364286e9c7835a';
const GM_WETH_AGGREGATE_VAULT_ADDRESS =
  '0xba51670cd6a3f6258459234928ac36cca39af516';

const UMAMI_GM_VAULTS = [
  {
    id: 'avax_gmusdc_weth',
    symbol: 'gmUSDC',
    address: GM_USDC_WETH,
    underlyingAsset: USDC_ADDRESS,
    decimals: 6,
    underlyingGmMarkets: [GM_MARKETS[0]],
    masterchefLpId: undefined,
    aggregateVaultAddress: GM_WETH_AGGREGATE_VAULT_ADDRESS,
    url: 'https://umami.finance/vaults/avax/gm/gmusdc',
  },
  {
    id: 'avax_gmweth',
    symbol: 'gmWETH',
    address: GM_WETH,
    underlyingAsset: wETH_ADDRESS,
    decimals: 18,
    underlyingGmMarkets: [GM_MARKETS[0]],
    masterchefLpId: undefined,
    aggregateVaultAddress: GM_WETH_AGGREGATE_VAULT_ADDRESS,
    url: 'https://umami.finance/vaults/avax/gm/gmweth',
  },
];

module.exports = {
  UMAMI_SYNTH_GM_VAULTS,
  UMAMI_GM_VAULTS,
  GMI_VAULT,
  GM_MARKETS,
  MASTER_CHEF,
  GMI_AGGREGATE_VAULT,
};
