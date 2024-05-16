const LP_DECIMALS = 6;
const LP_STAKING_ACCOUNT =
  '0xb247ddeee87e848315caf9a33b8e4c71ac53db888cb88143d62d2370cca0ead2';

const RESOURCES_ACCOUNT_0_5 =
  '0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8';
const MODULE_ACCOUNT_0_5 =
  '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e';

const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const APTOS_TOKEN = '0x1::aptos_coin::AptosCoin';
const AMNIS_ST_APT =
  '0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt';
const LZ_USDC =
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC';
const UNCORRELATED_CURVE =
  '0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::curves::Uncorrelated';
const APTOS_COINGECKO_ID = 'aptos';
const AMNIS_ST_APT_COINGECKO_ID = 'amnis-staked-aptos-coin';
const LZ_USDC_COINGECKO_ID = 'usd-coin';

const APT_AMNIS_STAPT_FARM = {
  deployedAddress: '0xe5d1cbab351261717d7b44787596033c691e4dd80cc3dede9a8682a6ec52214f',
  coinX: {
    type: APTOS_TOKEN,
    decimals: 8,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  coinY: {
    type: AMNIS_ST_APT,
    decimals: 8,
    coinGeckoId: AMNIS_ST_APT_COINGECKO_ID,
    symbol: 'amStApt',
  },
  curve: UNCORRELATED_CURVE,
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: 8,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0xe5d1cbab351261717d7b44787596033c691e4dd80cc3dede9a8682a6ec52214f-APT-amStApt-UNCORRELATED'
};

const USDC_AMNIS_STAPT_FARM = {
  deployedAddress: '0x07abf560d050c0249a610f9b78513dd8253b85dd14b9e7bedb86f8c6bb96cf64',
  coinX: {
    type: LZ_USDC,
    decimals: 6,
    coinGeckoId: LZ_USDC_COINGECKO_ID,
    symbol: 'zUSDC',
  },
  coinY: {
    type: AMNIS_ST_APT,
    decimals: 8,
    coinGeckoId: AMNIS_ST_APT_COINGECKO_ID,
    symbol: 'amStApt',
  },
  curve: UNCORRELATED_CURVE,
  rewardTokenInfo: {
    type: APTOS_TOKEN,
    decimals: 8,
    coinGeckoId: APTOS_COINGECKO_ID,
    symbol: 'APT',
  },
  resourceAccount: RESOURCES_ACCOUNT_0_5,
  moduleAccount: MODULE_ACCOUNT_0_5,
  uniqueFarmKey: '0x07abf560d050c0249a610f9b78513dd8253b85dd14b9e7bedb86f8c6bb96cf64-zUSDC-amStApt-UNCORRELATED'
};

const FARMS = [APT_AMNIS_STAPT_FARM, USDC_AMNIS_STAPT_FARM];

const WEEK_SEC = 7 * 24 * 60 * 60;

module.exports = {
  LP_DECIMALS,
  LP_STAKING_ACCOUNT,
  RESOURCES_ACCOUNT_0_5,
  NODE_URL,
  FARMS,
  USDC_AMNIS_STAPT_FARM,
  APT_AMNIS_STAPT_FARM,
  WEEK_SEC,
};
