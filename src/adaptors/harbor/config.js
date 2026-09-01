/**
 * Harbor Finance Market Configuration
 * 
 * Contract addresses for Harbor Finance markets.
 * 
 * IMPORTANT: All addresses must be verified against Harbor Finance official documentation
 * and Etherscan contract verification records before merging changes.
 * 
 * Verification sources:
 * - Harbor Finance Documentation: https://docs.harborfinance.io/
 * - Etherscan: https://etherscan.io/
 * 
 * Deployment Information:
 * - Harbor Finance contracts are deployed via factory pattern using CREATE3
 * - Factory Contract: 0xD696E56b3A054734d4C6DCBD32E11a278b0EC458
 *   See: https://etherscan.io/address/0xD696E56b3A054734d4C6DCBD32E11a278b0EC458
 * - Contracts are deterministically deployed through the BaoFactory using CREATE3,
 *   ensuring address consistency based on the factory address and deployment salt.
 * 
 * Address Verification Mapping:
 * - haETH (0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5) -> ETH/fxUSD market
 * - haBTC (0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7) -> BTC/fxUSD and BTC/stETH markets
 * - haEUR (0x83Fd69E0FF5767972b46E61C6833408361bF7346) -> EUR/fxUSD and EUR/stETH markets
 * - haGOLD (0x5b66D86932aE5D9751da588d91D494950554061d) -> GOLD/fxUSD and GOLD/stETH markets
 * - haMCAP (0x0C5CC55959DBDE5d9fa05064da754D6A298E9833) -> MCAP/fxUSD and MCAP/stETH markets
 * - haSILVER (0x7dE413B0Abee6f685a8ff7fB53330E3C56523e74) -> SILVER/fxUSD and SILVER/stETH markets
 * 
 * All addresses must match Harbor Finance documentation and be verified on Etherscan.
 */

const MARKETS = [
  // haETH market - ETH/fxUSD
  // Verified addresses for haETH (Harbor Anchored ETH)
  {
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5', // haETH token contract
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72', // ETH/fxUSD Anchor Pool
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06', // ETH/fxUSD Sail Pool
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F', // ETH/fxUSD Minter
  },
  // haBTC market - BTC/fxUSD
  // Verified addresses for haBTC (Harbor Anchored BTC) - BTC/fxUSD market
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7', // haBTC token contract
    collateralPoolAddress: '0x86561cdB34ebe8B9abAbb0DD7bEA299fA8532a49', // BTC/fxUSD Anchor Pool
    sailPoolAddress: '0x9e56F1E1E80EBf165A1dAa99F9787B41cD5bFE40', // BTC/fxUSD Sail Pool
    minterAddress: '0x33e32ff4d0677862fa31582CC654a25b9b1e4888', // BTC/fxUSD Minter
  },
  // haBTC market - BTC/stETH
  // Verified addresses for haBTC (Harbor Anchored BTC) - BTC/stETH market
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7', // haBTC token contract (same as above)
    collateralPoolAddress: '0x667Ceb303193996697A5938cD6e17255EeAcef51', // BTC/stETH Anchor Pool
    sailPoolAddress: '0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013', // BTC/stETH Sail Pool
    minterAddress: '0xF42516EB885E737780EB864dd07cEc8628000919', // BTC/stETH Minter
  },
  // haEUR market - EUR/fxUSD
  // Verified addresses for haEUR (Harbor Anchored EUR) - EUR/fxUSD market
  {
    peggedTokenSymbol: 'haEUR',
    peggedTokenAddress: '0x83Fd69E0FF5767972b46E61C6833408361bF7346', // haEUR token contract
    collateralPoolAddress: '0xe60054E6b518f67411834282cE1557381f050B13', // EUR/fxUSD Anchor Pool
    sailPoolAddress: '0xc5e0dA7e0a178850438E5E97ed59b6eb2562e88E', // EUR/fxUSD Sail Pool
    minterAddress: '0xDEFB2C04062350678965CBF38A216Cc50723B246', // EUR/fxUSD Minter
  },
  // haEUR market - EUR/stETH
  // Verified addresses for haEUR (Harbor Anchored EUR) - EUR/stETH market
  {
    peggedTokenSymbol: 'haEUR',
    peggedTokenAddress: '0x83Fd69E0FF5767972b46E61C6833408361bF7346', // haEUR token contract (same as above)
    collateralPoolAddress: '0x000564B33FFde65E6c3b718166856654e039D69B', // EUR/stETH Anchor Pool
    sailPoolAddress: '0x7553fb328ef35aF1c2ac4E91e53d6a6B62DFDdEa', // EUR/stETH Sail Pool
    minterAddress: '0x68911ea33E11bc77e07f6dA4db6cd23d723641cE', // EUR/stETH Minter
  },
  // haGOLD market - GOLD/fxUSD
  // Verified addresses for haGOLD (Harbor Anchored GOLD) - GOLD/fxUSD market
  {
    peggedTokenSymbol: 'haGOLD',
    peggedTokenAddress: '0x5b66D86932aE5D9751da588d91D494950554061d', // haGOLD token contract
    collateralPoolAddress: '0xC1EF32d4B959F2200efDeDdedadA226461d14DaC', // GOLD/fxUSD Anchor Pool
    sailPoolAddress: '0x5bDED171f1c08B903b466593B0E022F9FdE8399c', // GOLD/fxUSD Sail Pool
    minterAddress: '0x880600E0c803d836E305B7c242FC095Eed234A8f', // GOLD/fxUSD Minter
  },
  // haGOLD market - GOLD/stETH
  // Verified addresses for haGOLD (Harbor Anchored GOLD) - GOLD/stETH market
  {
    peggedTokenSymbol: 'haGOLD',
    peggedTokenAddress: '0x5b66D86932aE5D9751da588d91D494950554061d', // haGOLD token contract (same as above)
    collateralPoolAddress: '0x215C28DcCe0041eF9a17277CA271F100d9F345CF', // GOLD/stETH Anchor Pool
    sailPoolAddress: '0x2af96e906D568c92E53e96bB2878ce35E05dE69a', // GOLD/stETH Sail Pool
    minterAddress: '0xB315DC4698DF45A477d8bb4B0Bc694C4D1Be91b5', // GOLD/stETH Minter
  },
  // haMCAP market - MCAP/fxUSD
  // Verified addresses for haMCAP (Harbor Anchored MCAP) - MCAP/fxUSD market
  {
    peggedTokenSymbol: 'haMCAP',
    peggedTokenAddress: '0x0C5CC55959DBDE5d9fa05064da754D6A298E9833', // haMCAP token contract
    collateralPoolAddress: '0x7928a145Eed1374f5594c799290419B80fCd03f0', // MCAP/fxUSD Anchor Pool
    sailPoolAddress: '0x8CF0C5F1394E137389D6dbfE91c56D00dEcdDAD8', // MCAP/fxUSD Sail Pool
    minterAddress: '0x3d3EAe3a4Ee52ef703216c62EFEC3157694606dE', // MCAP/fxUSD Minter
  },
  // haMCAP market - MCAP/stETH
  // Verified addresses for haMCAP (Harbor Anchored MCAP) - MCAP/stETH market
  {
    peggedTokenSymbol: 'haMCAP',
    peggedTokenAddress: '0x0C5CC55959DBDE5d9fa05064da754D6A298E9833', // haMCAP token contract (same as above)
    collateralPoolAddress: '0x4cFf4948A0EA73Ee109327b56da0bead8c323189', // MCAP/stETH Anchor Pool
    sailPoolAddress: '0x505bfC99D2FB1A1424b2A4AA81303346df4f27E9', // MCAP/stETH Sail Pool
    minterAddress: '0xe37e34Ab0AaaabAc0e20c911349c1dEfAD0691B6', // MCAP/stETH Minter
  },
  // haSILVER market - SILVER/fxUSD
  // Verified addresses for haSILVER (Harbor Anchored SILVER) - SILVER/fxUSD market
  {
    peggedTokenSymbol: 'haSILVER',
    peggedTokenAddress: '0x7dE413B0Abee6f685a8ff7fB53330E3C56523e74', // haSILVER token contract
    collateralPoolAddress: '0x7619664fe05c9cbDA5B622455856D7CA11Cb8800', // SILVER/fxUSD Anchor Pool
    sailPoolAddress: '0x24AEf2d27146497B18df180791424b1010bf1889', // SILVER/fxUSD Sail Pool
    minterAddress: '0x177bb50574CDA129BDd0B0F50d4E061d38AA75Ef', // SILVER/fxUSD Minter
  },
  // haSILVER market - SILVER/stETH
  // Verified addresses for haSILVER (Harbor Anchored SILVER) - SILVER/stETH market
  {
    peggedTokenSymbol: 'haSILVER',
    peggedTokenAddress: '0x7dE413B0Abee6f685a8ff7fB53330E3C56523e74', // haSILVER token contract (same as above)
    collateralPoolAddress: '0x1C9c1cF9aa9fc86dF980086CbC5a5607522cFc3E', // SILVER/stETH Anchor Pool
    sailPoolAddress: '0x4C0F988b3c0C58F5ea323238E9d62B79582738e6', // SILVER/stETH Sail Pool
    minterAddress: '0x1c0067BEe039A293804b8BE951B368D2Ec65b3e9', // SILVER/stETH Minter
  },
];

// Chainlink price feed addresses on Ethereum mainnet
const CHAINLINK_FEEDS = {
  ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD
  BTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', // BTC/USD
  XAU_USD: '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6', // Gold/USD
  EUR_USD: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1', // EUR/USD
  XAG_USD: '0x379589227b15F1a12195D3f2d90bBc9F31f95235', // Silver/USD
  TOT_MCAP_USD: '0xEC8761a0A73c34329CA5B1D3Dc7eD07F30e836e2', // Total Crypto Market Cap/USD
};

// Mapping of pegged token symbols to their Chainlink price feed keys
// Used to determine which Chainlink feed to use for price lookups
const TOKEN_CHAINLINK_FEED_MAP = {
  'haBTC': 'BTC_USD',
  'haETH': 'ETH_USD',
  'haGOLD': 'XAU_USD',
  'haEUR': 'EUR_USD',
  'haSILVER': 'XAG_USD',
  'haMCAP': 'TOT_MCAP_USD', // Reserved for future haMCAP market
};

// Mapping for displaying underlying asset names in logs
const UNDERLYING_ASSET_DISPLAY = {
  'haBTC': 'BTC',
  'haETH': 'ETH',
  'haGOLD': 'XAU',
  'haEUR': 'EUR',
  'haSILVER': 'XAG',
  'haMCAP': 'MCAP',
};

module.exports = {
  MARKETS,
  CHAINLINK_FEEDS,
  TOKEN_CHAINLINK_FEED_MAP,
  UNDERLYING_ASSET_DISPLAY,
};
