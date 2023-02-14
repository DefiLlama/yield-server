const { ContractAddresses } = require('./address');

const TokenPriceAcquireMethode = {
  BINANCE_API: 'BINANCE_API',
  COINGECKO_API: 'COINGECKO_API',
  UNISWAP_USDT_LP: 'UNISWAP_USDT_LP',
  UNISWAP_ETH_LP: 'UNISWAP_ETH_LP',
};

exports.TokenPriceAcquireMethode = TokenPriceAcquireMethode;

exports.VaultTokens = [
  {
    name: 'USDT',
    tokenContractAddress: ContractAddresses.usdtTokenAddress,
    tokenDecimal: 6,
    bTokenContractAddress: ContractAddresses.bVaultUsdtAddress,
    bTokenDecimal: 6,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'USDT',
    uniPoolAddress: '',
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: false,
  },
  {
    name: 'USDC',
    tokenContractAddress: ContractAddresses.usdcTokenAddress,
    tokenDecimal: 6,
    bTokenContractAddress: ContractAddresses.bVaultUsdcAddress,
    bTokenDecimal: 6,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'USDCUSDT',
    uniPoolAddress: ContractAddresses.usdcUsdtPoolAddress,
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: false,
  },
  {
    name: 'ARPA',
    tokenContractAddress: ContractAddresses.arpaTokenAddress,
    tokenDecimal: 18,
    bTokenContractAddress: ContractAddresses.bVaultArpaAddress,
    bTokenDecimal: 18,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'ARPAUSDT',
    uniPoolAddress: ContractAddresses.arpaUsdtUniPoolAddress,
    coingeckoApiTokenId: '',
    coreStrategy: 'ARPA',
    onhold: false,
  },
  {
    name: 'WBTC',
    tokenContractAddress: ContractAddresses.wbtcTokenAddress,
    tokenDecimal: 8,
    bTokenContractAddress: ContractAddresses.bVaultWbtcAddress,
    bTokenDecimal: 8,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'BTCUSDT',
    uniPoolAddress: ContractAddresses.wbtcUsdtUniPoolAddress,
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: false,
  },
  {
    name: 'HBTC',
    tokenContractAddress: ContractAddresses.hbtcTokenAddress,
    tokenDecimal: 18,
    bTokenContractAddress: ContractAddresses.bVaultHbtcAddress,
    bTokenDecimal: 18,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_ETH_LP,
    binanceApiSymbol: 'BTCUSDT',
    uniPoolAddress: ContractAddresses.hbtcEthUniPoolAddress,
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: false,
  },
  {
    name: 'BUSD',
    tokenContractAddress: ContractAddresses.busdTokenAddress,
    tokenDecimal: 18,
    bTokenContractAddress: ContractAddresses.bVaultBusdAddress,
    bTokenDecimal: 18,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'BUSDUSDT',
    uniPoolAddress: ContractAddresses.busdUsdtUniPoolAddress,
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: false,
  },
  {
    name: 'DAI',
    tokenContractAddress: ContractAddresses.daiTokenAddress,
    tokenDecimal: 18,
    bTokenContractAddress: ContractAddresses.bVaultDaiAddress,
    bTokenDecimal: 18,
    priceSrc: TokenPriceAcquireMethode.UNISWAP_USDT_LP,
    binanceApiSymbol: 'DAIUSDT',
    uniPoolAddress: '', // change to prod
    coingeckoApiTokenId: '',
    coreStrategy: 'CRV',
    onhold: true,
  },
];

exports.ConfigContent = {
  // nav url
  governanceUrl: 'https://snapshot.page/#/bella',
  liquiditMiningUrl: 'https://liquidity.bella.fi',
  lockerUrl: 'https://locker.bella.fi/',

  // tutorial url
  bannerUrl:
    'https://bellaofficial.medium.com/tutorial-on-bella-flex-savings-v2-e622716313ca',

  // staking monthly reward
  weeklyStakingBelReward: 5000,

  // const url
  peckShieldAuditUrl:
    'https://github.com/peckshield/publications/blob/master/audit_reports/bella_audit_report_2020_48_en_1_0.pdf',
  binancePriceApi: 'https://api.binance.com/api/v3/avgPrice?symbol=',
  coingeckoPriceApi: 'https://api.coingecko.com/api/v3/simple/price?ids=',
  crvBaseApyUrl: 'https://stats.curve.fi/raw-stats/apys.json',

  // 3pool crv api
  crvApy: 13.89,
  wbtcApy: 12.03,

  // arpa strategy apy
  arpaVaultContractAddress: '0x750d30A8259E63eD72a075f5b6630f08ce7996d0',
  arpaRewardAmount: 1000000,
};

exports.StakingTokens = [
  {
    id: 1,
    title: 'USDT Tea',
    desc: 'Stake bUSDT for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultUsdtAddress,
    bTokenDecimal: 6,
    bPoolId: 0,
    symbol: 'bUSDT',
    weeklyRewardBel: 8160,
  },
  {
    id: 2,
    title: 'USDC Cake',
    desc: 'Stake bUSDC for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultUsdcAddress,
    bTokenDecimal: 6,
    bPoolId: 1,
    symbol: 'bUSDC',
    weeklyRewardBel: 5175,
  },
  {
    id: 3,
    title: 'ARPA Cake',
    desc: 'Stake bARPA for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultArpaAddress,
    bTokenDecimal: 18,
    bPoolId: 2,
    symbol: 'bARPA',
    weeklyRewardBel: 9000,
  },
  {
    id: 4,
    title: 'WBTC Cocktail',
    desc: 'Stake bWBTC for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultWbtcAddress,
    bTokenDecimal: 8,
    bPoolId: 3,
    symbol: 'bWBTC',
    weeklyRewardBel: 12800,
  },
  {
    id: 5,
    title: 'HBTC Sake',
    desc: 'Stake bHBTC for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultHbtcAddress,
    bTokenDecimal: 18,
    bPoolId: 4,
    symbol: 'bHBTC',
    weeklyRewardBel: 1750,
  },
  {
    id: 6,
    title: 'BUSD Champagne',
    desc: 'Stake bBUSD for BEL Rewards',
    bTokenContractAddress: ContractAddresses.bVaultBusdAddress,
    bTokenDecimal: 18,
    bPoolId: 5,
    symbol: 'bBUSD',
    weeklyRewardBel: 0,
  },
];
