const pools = [
  // ALGO
  {
    appId: 971368268,
    assetId: 0,
    fAssetId: 971381860,
    symbol: 'ALGO',
    hasReward: false,
  },
  // gALGO
  {
    appId: 971370097,
    assetId: 793124631,
    fAssetId: 971383839,
    symbol: 'gALGO',
    hasReward: false,
  },
  // USDC
  {
    appId: 971372237,
    assetId: 31566704,
    fAssetId: 971384592,
    symbol: 'USDC',
    hasReward: true,
  },
  // USDt
  {
    appId: 971372700,
    assetId: 312769,
    fAssetId: 971385312,
    symbol: 'USDt',
    hasReward: true,
  },
  // goBTC
  {
    appId: 971373361,
    assetId: 386192725,
    fAssetId: 971386173,
    symbol: 'goBTC',
    hasReward: false,
  },
  // goETH
  {
    appId: 971373611,
    assetId: 386195940,
    fAssetId: 971387073,
    symbol: 'goETH',
    hasReward: false,
  },
  // Opul
  {
    appId: 1044267181,
    assetId: 287867876,
    fAssetId: 1044269355,
    symbol: 'OPUL',
    hasReward: false,
  },
];

const oracleAppId = 1040271396;
const oracleDecimals = 14;

module.exports = {
  pools,
  oracleAppId,
  oracleDecimals,
};
