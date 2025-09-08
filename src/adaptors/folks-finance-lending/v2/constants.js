
const LoanType = {
  GENERAL: 'GENERAL',
  ALGORAND_ECOSYSTEM: 'ALGORAND_ECOSYSTEM',
};

const MainnetLoans = {
  [LoanType.GENERAL]: 971388781,
  [LoanType.ALGORAND_ECOSYSTEM]: 3184333108,
};


const pools = [
  // ALGO
  {
    appId: 971368268,
    assetId: 0,
    fAssetId: 971381860,
    symbol: 'ALGO',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // gALGO
  {
    appId: 971370097,
    assetId: 793124631,
    fAssetId: 971383839,
    symbol: 'gALGO',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // xALGO
  {
    appId: 2611131944,
    assetId: 1134696561,
    fAssetId: 2611138444,
    symbol: 'xALGO',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // tALGO
  {
    appId: 3073474613,
    assetId: 2537013734,
    fAssetId: 3073480070,
    symbol: 'tALGO',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // USDC
  {
    appId: 971372237,
    assetId: 31566704,
    fAssetId: 971384592,
    symbol: 'USDC',
    hasReward: true,
    loanType: LoanType.GENERAL,
  },
  // USDt
  {
    appId: 971372700,
    assetId: 312769,
    fAssetId: 971385312,
    symbol: 'USDt',
    hasReward: true,
    loanType: LoanType.GENERAL,
  },
  // Gard
  {
    appId: 1060585819,
    assetId: 684649988,
    fAssetId: 1060587336,
    symbol: 'GARD',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // EURS
  {
    appId: 1247053569,
    assetId: 227855942,
    fAssetId: 1247054501,
    symbol: 'EURS',
    hasReward: true,
    loanType: LoanType.GENERAL,
  },
  // goBTC
  {
    appId: 971373361,
    assetId: 386192725,
    fAssetId: 971386173,
    symbol: 'goBTC',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // goETH
  {
    appId: 971373611,
    assetId: 386195940,
    fAssetId: 971387073,
    symbol: 'goETH',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WBTC
  {
    appId: 1067289273,
    assetId: 1058926737,
    fAssetId: 1067295154,
    symbol: 'WBTC',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WETH
  {
    appId: 1067289481,
    assetId: 887406851,
    fAssetId: 1067295558,
    symbol: 'WETH',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WAVAX
  {
    appId: 1166977433,
    assetId: 893309613,
    fAssetId: 1166979636,
    symbol: 'WAVAX',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WSOL
  {
    appId: 1166980669,
    assetId: 887648583,
    fAssetId: 1166980820,
    symbol: 'WSOL',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WLINK
  {
    appId: 1216434571,
    assetId: 1200094857,
    fAssetId: 1216437148,
    symbol: 'WLINK',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // GOLD
  {
    appId: 1258515734,
    assetId: 246516580,
    fAssetId: 1258524377,
    symbol: 'GOLD',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // SILVER
  {
    appId: 1258524099,
    assetId: 246519683,
    fAssetId: 1258524381,
    symbol: 'SILVER',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // Opul
  {
    appId: 1044267181,
    assetId: 287867876,
    fAssetId: 1044269355,
    symbol: 'OPUL',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // WMPL
  {
    appId: 1166982094,
    assetId: 1163259470,
    fAssetId: 1166982296,
    symbol: 'WMPL',
    hasReward: false,
    loanType: LoanType.GENERAL,
  },
  // // ISOLATED_ALGO
  {
    appId: 3184317016,
    assetId: 0,
    fAssetId: 3184331013,
    symbol: 'ISOLATED_ALGO',
    hasReward: false,
    loanType: LoanType.ALGORAND_ECOSYSTEM,
  },
  // ISOLATED_USDC
  {
    appId: 3184324594,
    assetId: 31566704,
    fAssetId: 3184331239,
    symbol: 'ISOLATED_USDC',
    hasReward: false,
    loanType: LoanType.ALGORAND_ECOSYSTEM,
  },
  // ISOLATED_TINY
  {
    appId: 3184325123,
    assetId: 2200000000,
    fAssetId: 3184331789,
    symbol: 'ISOLATED_TINY',
    hasReward: true,
    loanType: LoanType.ALGORAND_ECOSYSTEM,
  },
];

const oracleAppId = 1040271396;
const oracleDecimals = 14;

module.exports = {
  pools,
  oracleAppId,
  oracleDecimals,
  LoanType,
  MainnetLoans,
};
