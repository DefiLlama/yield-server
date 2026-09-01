const LP_DECIMALS = 8;
const LP_STAKING_ACCOUNT =
  '0xb247ddeee87e848315caf9a33b8e4c71ac53db888cb88143d62d2370cca0ead2';

const RESOURCES_ACCOUNT_0_5 =
  '0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8';
const RESOURCES_ACCOUNT_0 =
  '0x05a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948';
const MODULE_ACCOUNT_0_5 =
  '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e';
const MODULE_ACCOUNT_0 =
  '0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12';

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const UNCORRELATED_CURVE =
  '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::curves::Uncorrelated';
const UNCORRELATED_CURVE_0 =
  '0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12::curves::Uncorrelated';
const STABLE_CURVE =
  '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::curves::Stable';

const APTOS_TOKEN = '0x1::aptos_coin::AptosCoin';
const APTOS_COINGECKO_ID = 'aptos';

const AMNIS_ST_APT =
  '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::amapt_token::AmnisApt';
const AMNIS_APT_COINGECKO_ID = 'amnis-aptos';

const LZ_USDC =
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC';
const LZ_USDC_COINGECKO_ID = 'usd-coin';

const LZ_USDT =
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';
const LZ_USDT_COINGECKO_ID = 'tether';

const DONK_TOKEN = '0xe88ae9670071da40a9a6b1d97aab8f6f1898fdc3b8f1c1038b492dfad738448b::coin::Donk';
const DONK_COINGECKO_ID = 'donk_apt';

// const DUMDUM_TOKEN = '0xbe3c4b493632b4d776d56e19d91dcfb34f591f759f6b57f8632d455360da503c::dumdum_coin::DumdumCoin';
// const DUMDUM_COINGECKO_ID = 'Dumdum';

const WETH_TOKEN = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::WETH'
const WETH_COINGECKO_ID = 'weth'

const ST_APT_TOKEN = '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt'
const ST_APT_COINGECKO_ID = 'amnis-staked-aptos-coin'

const APT_DONK_FARM = {
  deployedAddress: '0xd504f16190f067d94ff4aad9b91e53cbe79c6a3f2231b96fdcce3cb7879b6d84',
  coinX: {
    type: DONK_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: DONK_COINGECKO_ID,
    symbol: 'Donk',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: UNCORRELATED_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: DONK_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: DONK_COINGECKO_ID,
    symbol: 'Donk',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0xd504f16190f067d94ff4aad9b91e53cbe79c6a3f2231b96fdcce3cb7879b6d84-APT-Donk-UNCORRELATED'
};

// const APT_DUMDUM_FARM = {
//   deployedAddress: '0xa121de669ff4b668bf1a0410a65faf9c8b1f2ff43f817ef61b6aea1935654209',
//   coinX: {
//     type: APTOS_TOKEN,
//     decimals: LP_DECIMALS,
//     coinGeckoId: APTOS_COINGECKO_ID,
//     symbol: 'APT',
//   },
//   coinY: {
//     type: DUMDUM_TOKEN,
//     decimals: LP_DECIMALS,
//     coinGeckoId: DUMDUM_COINGECKO_ID,
//     symbol: 'DUMDUM',
//   },
//   curve: UNCORRELATED_CURVE,
//   version: 'v0.5',
//   rewardTokenInfo: {
//     type: DUMDUM_TOKEN,
//     decimals: LP_DECIMALS,
//     coinGeckoId: DUMDUM_COINGECKO_ID,
//     symbol: 'DUMDUM',
//   },
//   resourceAccount: RESOURCES_ACCOUNT_0_5,
//   moduleAccount: MODULE_ACCOUNT_0_5,
//   uniqueFarmKey: '0xa121de669ff4b668bf1a0410a65faf9c8b1f2ff43f817ef61b6aea1935654209-APT-Dumdum-UNCORRELATED'
// };

const WETH_APT_FARM = {
  deployedAddress: '0xbac870e3aa0bef8b40a8b4845589ef6eb118283fd51d837f15bb95758cfcfe98',
  coinX: {
    type: WETH_TOKEN,
    decimals: 6,
    coinGeckoId: WETH_COINGECKO_ID,
    symbol: 'zWETH',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: UNCORRELATED_CURVE_0,
  version: 'v0',
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0,
  moduleAccount: MODULE_ACCOUNT_0,
  uniqueFarmKey: '0xbac870e3aa0bef8b40a8b4845589ef6eb118283fd51d837f15bb95758cfcfe98-zWETH-APT-UNCORRELATED'
};

const USDC_USDT_FARM = {
  deployedAddress: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8',
  coinX: {
    type: LZ_USDC,
    decimals: 6,
    coinGeckoId: LZ_USDC_COINGECKO_ID,
    symbol: 'zUSDC',
  },
  coinY: {
    type: LZ_USDT,
    decimals: 6,
    coinGeckoId: LZ_USDT_COINGECKO_ID,
    symbol: 'zUSDT',
  },
  curve: STABLE_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8-USDC-USDT-STABLE'
};

const USDC_APT_FARM = {
  deployedAddress: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8',
  coinX: {
    type: LZ_USDC,
    decimals: 6,
    coinGeckoId: LZ_USDC_COINGECKO_ID,
    symbol: 'zUSDC',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: UNCORRELATED_CURVE_0,
  version: 'v0',
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0,
  moduleAccount: MODULE_ACCOUNT_0,
  uniqueFarmKey: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8-USDC-APT-UNCORRELATED'
};

const USDT_APT_FARM = {
  deployedAddress: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8',
  coinX: {
    type: LZ_USDT,
    decimals: 6,
    coinGeckoId: LZ_USDT_COINGECKO_ID,
    symbol: 'zUSDT',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: UNCORRELATED_CURVE_0,
  version: 'v0',
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0,
  moduleAccount: MODULE_ACCOUNT_0,
  uniqueFarmKey: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8-USDT-APT-UNCORRELATED'
};

const AMNIS_APT_APT_FARM = {
  deployedAddress: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8',
  coinX: {
    type: AMNIS_ST_APT,
    decimals: LP_DECIMALS,
    coinGeckoId: AMNIS_APT_COINGECKO_ID,
    symbol: 'amAPT',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: STABLE_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0xf4eceeb8438242ed43e2d6f7b2534e8e2e1e96f12755ebbc345a7b570ec367a8-AMNIS_APT-APT-STABLE'
};

const AM_APT_APT_FARM = {
  deployedAddress: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880',
  coinX: {
    type: AMNIS_ST_APT,
    decimals: LP_DECIMALS,
    coinGeckoId: AMNIS_APT_COINGECKO_ID,
    symbol: 'amAPT',
  },
  coinY: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  curve: STABLE_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: AMNIS_ST_APT,
    decimals: LP_DECIMALS,
    coinGeckoId: AMNIS_APT_COINGECKO_ID,
    symbol: 'amAPT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880-AMNIS_APT-APT-STABLE'
};

const ST_APT_APT_FARM = {
  deployedAddress: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880',
  coinX: {
    type: APTOS_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  coinY: {
    type: ST_APT_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: ST_APT_COINGECKO_ID,
    symbol: 'stAPT',
  },
  curve: UNCORRELATED_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: AMNIS_ST_APT,
    decimals: LP_DECIMALS,
    coinGeckoId: AMNIS_APT_COINGECKO_ID,
    symbol: 'amAPT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880-ST_APT-APT-UNCORRELATED'
};

const USDC_ST_APT_FARM = {
  deployedAddress: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880',
  coinX: {
    type: LZ_USDC,
    decimals: 6,
    coinGeckoId: LZ_USDC_COINGECKO_ID,
    symbol: 'USDC',
  },
  coinY: {
    type: ST_APT_TOKEN,
    decimals: LP_DECIMALS,
    coinGeckoId: ST_APT_COINGECKO_ID,
    symbol: 'stAPT',
  },
  curve: UNCORRELATED_CURVE,
  version: 'v0.5',
  rewardTokenInfo: {
    type: AMNIS_ST_APT,
    decimals: LP_DECIMALS,
    coinGeckoId: AMNIS_APT_COINGECKO_ID,
    symbol: 'amAPT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0x845a18353b4b5287435f8bf1d831a81cbc054a2314b5d06e3194e353b00ec880-USDC-ST_APT-UNCORRELATED'
};

const FARMS = [
  APT_DONK_FARM,
  // APT_DUMDUM_FARM,
  WETH_APT_FARM,
  USDC_USDT_FARM,
  USDC_APT_FARM,
  USDT_APT_FARM,
  AMNIS_APT_APT_FARM,
  AM_APT_APT_FARM,
  ST_APT_APT_FARM,
  USDC_ST_APT_FARM,
];

const WEEK_SEC = 7 * 24 * 60 * 60;

module.exports = {
  LP_DECIMALS,
  LP_STAKING_ACCOUNT,
  NODE_URL,
  FARMS,
  WEEK_SEC,
};
