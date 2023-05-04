const pools = [
  // ALGO
  {
    appId: 971368268,
    assetId: 0,
    symbol: 'ALGO',
  },
  // gALGO
  {
    appId: 971370097,
    assetId: 793124631,
    symbol: 'gALGO',
  },
  // USDC
  {
    appId: 971372237,
    assetId: 31566704,
    symbol: 'USDC',
  },
  // USDt
  {
    appId: 971372700,
    assetId: 312769,
    symbol: 'USDt',
  },
  // goBTC
  {
    appId: 971373361,
    assetId: 386192725,
    symbol: 'goBTC',
  },
  // goETH
  {
    appId: 971373611,
    assetId: 386195940,
    symbol: 'goETH',
  },
  // Opul
  {
    appId: 1044267181,
    assetId: 287867876,
    symbol: 'OPUL',
  },
];

const oracleAppId = 1040271396;
const oracleDecimals = 14;

module.exports = {
  pools,
  oracleAppId,
  oracleDecimals,
};
