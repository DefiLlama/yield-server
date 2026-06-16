/**
 * Harbor Finance market configuration (multi-chain).
 *
 * Sources:
 * - harbor-minter: harbor/deployments/{mainnet,megaeth}/*.state.json
 * - harbor-price-aggregators: src/feeds/chainlink/{mainnet,megaeth}/*.sol
 *
 * Mainnet haUSD (ethereum): harbor_v1.state.json — USD::pegged + USD::PAXG, USD::stETH, USD::tBTC, USD::wBTC.
 * MegaETH haUSD: harbor_megaeth_v1.state.json — USD::pegged + USD::stETH.
 * Protocol market keys use stETH (not wstETH) on both chains; wstETH may be used internally as wrapped collateral.
 */

const CHAINLINK_FEEDS = {
  ethereum: {
    ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    BTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    XAU_USD: '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6',
    EUR_USD: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1',
    XAG_USD: '0x379589227b15F1a12195D3f2d90bBc9F31f95235',
    MCAP_USD: '0xEC8761a0A73c34329CA5B1D3Dc7eD07F30e836e2',
    STETH_USD: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8',
    STETH_ETH: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
    USDE_USD: '0xa569d910839Ae8865Da8F8e70FfFb0cBA869F961',
    TBTC_USD: '0x8350b7De6a6a2C1368E7D4Bd968190e13E354297',
    PAXG_USD: '0x9944D86CEB9160aF5C5feB251FD671923323f8C3',
    WBTC_BTC: '0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23',
  },
  megaeth: {
    ETH_USD: '0xcA4e254D95637DE95E2a2F79244b03380d697feD',
    BTC_USD: '0xc6E3007B597f6F5a6330d43053D1EF73cCbbE721',
    STETH_ETH: '0x556ccb034718065067A3d323DDe0B0A27637f5ba',
    WSTETH_STETH: '0xe020C0Abc50E6581A95cb79Ff1021728C9Ec0640',
    USDE_USD: '0x4F2A91150D5D6B91B5F0b0DF6F109C4BCeCefA61',
  },
};

/** Default Chainlink feed for pegged token USD price (collateral-specific feeds override per market). */
const TOKEN_CHAINLINK_FEED_MAP = {
  haBTC: 'BTC_USD',
  haETH: 'ETH_USD',
  haGOLD: 'XAU_USD',
  haEUR: 'EUR_USD',
  haSILVER: 'XAG_USD',
  haMCAP: 'MCAP_USD',
  haUSD: 'USDE_USD',
};

const UNDERLYING_ASSET_DISPLAY = {
  haBTC: 'BTC',
  haETH: 'ETH',
  haGOLD: 'XAU',
  haEUR: 'EUR',
  haSILVER: 'XAG',
  haMCAP: 'MCAP',
  haUSD: 'USD',
};

const MARKETS = [
  // --- Ethereum (existing ha* tokens) ---
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5',
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72',
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06',
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F',
    marketLabel: 'ETH/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7',
    collateralPoolAddress: '0x86561cdB34ebe8B9abAbb0DD7bEA299fA8532a49',
    sailPoolAddress: '0x9e56F1E1E80EBf165A1dAa99F9787B41cD5bFE40',
    minterAddress: '0x33e32ff4d0677862fa31582CC654a25b9b1e4888',
    marketLabel: 'BTC/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7',
    collateralPoolAddress: '0x667Ceb303193996697A5938cD6e17255EeAcef51',
    sailPoolAddress: '0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013',
    minterAddress: '0xF42516EB885E737780EB864dd07cEc8628000919',
    marketLabel: 'BTC/stETH',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haEUR',
    peggedTokenAddress: '0x83Fd69E0FF5767972b46E61C6833408361bF7346',
    collateralPoolAddress: '0xe60054E6b518f67411834282cE1557381f050B13',
    sailPoolAddress: '0xc5e0dA7e0a178850438E5E97ed59b6eb2562e88E',
    minterAddress: '0xDEFB2C04062350678965CBF38A216Cc50723B246',
    marketLabel: 'EUR/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haEUR',
    peggedTokenAddress: '0x83Fd69E0FF5767972b46E61C6833408361bF7346',
    collateralPoolAddress: '0x000564B33FFde65E6c3b718166856654e039D69B',
    sailPoolAddress: '0x7553fb328ef35aF1c2ac4E91e53d6a6B62DFDdEa',
    minterAddress: '0x68911ea33E11bc77e07f6dA4db6cd23d723641cE',
    marketLabel: 'EUR/stETH',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haGOLD',
    peggedTokenAddress: '0x5b66D86932aE5D9751da588d91D494950554061d',
    collateralPoolAddress: '0xC1EF32d4B959F2200efDeDdedadA226461d14DaC',
    sailPoolAddress: '0x5bDED171f1c08B903b466593B0E022F9FdE8399c',
    minterAddress: '0x880600E0c803d836E305B7c242FC095Eed234A8f',
    marketLabel: 'GOLD/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haGOLD',
    peggedTokenAddress: '0x5b66D86932aE5D9751da588d91D494950554061d',
    collateralPoolAddress: '0x215C28DcCe0041eF9a17277CA271F100d9F345CF',
    sailPoolAddress: '0x2af96e906D568c92E53e96bB2878ce35E05dE69a',
    minterAddress: '0xB315DC4698DF45A477d8bb4B0Bc694C4D1Be91b5',
    marketLabel: 'GOLD/stETH',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haMCAP',
    peggedTokenAddress: '0x0C5CC55959DBDE5d9fa05064da754D6A298E9833',
    collateralPoolAddress: '0x7928a145Eed1374f5594c799290419B80fCd03f0',
    sailPoolAddress: '0x8CF0C5F1394E137389D6dbfE91c56D00dEcdDAD8',
    minterAddress: '0x3d3EAe3a4Ee52ef703216c62EFEC3157694606dE',
    marketLabel: 'MCAP/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haMCAP',
    peggedTokenAddress: '0x0C5CC55959DBDE5d9fa05064da754D6A298E9833',
    collateralPoolAddress: '0x4cFf4948A0EA73Ee109327b56da0bead8c323189',
    sailPoolAddress: '0x505bfC99D2FB1A1424b2A4AA81303346df4f27E9',
    minterAddress: '0xe37e34Ab0AaaabAc0e20c911349c1dEfAD0691B6',
    marketLabel: 'MCAP/stETH',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haSILVER',
    peggedTokenAddress: '0x7dE413B0Abee6f685a8ff7fB53330E3C56523e74',
    collateralPoolAddress: '0x7619664fe05c9cbDA5B622455856D7CA11Cb8800',
    sailPoolAddress: '0x24AEf2d27146497B18df180791424b1010bf1889',
    minterAddress: '0x177bb50574CDA129BDd0B0F50d4E061d38AA75Ef',
    marketLabel: 'SILVER/fxUSD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haSILVER',
    peggedTokenAddress: '0x7dE413B0Abee6f685a8ff7fB53330E3C56523e74',
    collateralPoolAddress: '0x1C9c1cF9aa9fc86dF980086CbC5a5607522cFc3E',
    sailPoolAddress: '0x4C0F988b3c0C58F5ea323238E9d62B79582738e6',
    minterAddress: '0x1c0067BEe039A293804b8BE951B368D2Ec65b3e9',
    marketLabel: 'SILVER/stETH',
  },

  // --- Ethereum haUSD (harbor_v1.state.json) ---
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haUSD',
    peggedTokenAddress: '0x2536A8636A99466173229AB15fdb37Fcaa05BA1A',
    collateralPoolAddress: '0xAf7B276dF93F74AE7780E1D5f550bEaf4Ff26415',
    sailPoolAddress: '0x45B3e0dC9DdaDE6D5e2D45AD08c28B794Bdbf985',
    minterAddress: '0x7E1D48774F6faD0Aa41cbb47A66BB8Ec3094e3c2',
    marketLabel: 'USD/PAXG',
    collateralPriceFeed: 'PAXG_USD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haUSD',
    peggedTokenAddress: '0x2536A8636A99466173229AB15fdb37Fcaa05BA1A', // USD::pegged
    collateralPoolAddress: '0xD21613339E8A6adba7a084f67802731e6045d801', // USD::stETH::stabilityPoolCollateral
    sailPoolAddress: '0x6E7b445e4dac4787445f31382f4E3dCAd510c238', // USD::stETH::stabilityPoolLeveraged
    minterAddress: '0xC14837C30BEdF3081cBa2cDeB067fA6F0381e69b', // USD::stETH::minter
    marketLabel: 'USD/stETH',
    collateralPriceFeed: 'STETH_USD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haUSD',
    peggedTokenAddress: '0x2536A8636A99466173229AB15fdb37Fcaa05BA1A',
    collateralPoolAddress: '0x9a229b4ec6A0D2154689De8EDa9d14C884DE707b',
    sailPoolAddress: '0x6a059A79bD261e2bFD160CAc4733108a8BDa2BD6',
    minterAddress: '0x1E326fFF476a5d107f1f6684380f677d2fd5E492',
    marketLabel: 'USD/tBTC',
    collateralPriceFeed: 'TBTC_USD',
  },
  {
    chain: 'ethereum',
    peggedTokenSymbol: 'haUSD',
    peggedTokenAddress: '0x2536A8636A99466173229AB15fdb37Fcaa05BA1A',
    collateralPoolAddress: '0xa1959F3dae8C3e7c8825dD7902D30569aF092Ed8',
    sailPoolAddress: '0xd16C291456060bF36023D9a935719380a14dE3AD',
    minterAddress: '0x0aA2b6Ee6D079f39A52725B33B15854505542B51',
    marketLabel: 'USD/wBTC',
    collateralPriceFeed: 'WBTC_USD',
  },

  // --- MegaETH haUSD: single market USD::stETH (harbor_megaeth_v1.state.json) ---
  {
    chain: 'megaeth',
    peggedTokenSymbol: 'haUSD',
    peggedTokenAddress: '0xbEd2c24Cf10d7aC58350364aF8d3AbC0ce0D626f', // USD::pegged
    collateralPoolAddress: '0xe4C4C226A2a267172C09efD43f9Db92B875FdA72', // USD::stETH::stabilityPoolCollateral
    sailPoolAddress: '0x981D002e7A14E9f37f5feC17caa0B69f7A722132', // USD::stETH::stabilityPoolLeveraged
    minterAddress: '0x77aD4a052812f1EeD89Fb4ED309e81c815D8d755', // USD::stETH::minter
    marketLabel: 'USD/stETH',
    collateralPriceFeed: 'STETH_USD', // composite: STETH_ETH × ETH_USD on megaeth
  },
];

const UNDERLYING_ASSETS = {
  ethereum: {
    haBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    haETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    haEUR: '0xdb25f211ab05b1c97d595516f45794528a807ad8',
    haGOLD: 'coingecko:pax-gold',
    haSILVER: 'coingecko:silver',
    haUSD: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  },
  megaeth: {
    haUSD: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', // USDM (MegaETH native USD stable)
  },
};

module.exports = {
  MARKETS,
  CHAINLINK_FEEDS,
  TOKEN_CHAINLINK_FEED_MAP,
  UNDERLYING_ASSET_DISPLAY,
  UNDERLYING_ASSETS,
};
