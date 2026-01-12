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
 * - haEUR (0x83Fd69E0FF5767972b46E61C6833408361bF7346) -> EUR/fxUSD market
 * - haGOLD (0x5b66D86932aE5D9751da588d91D494950554061d) -> GOLD/fxUSD market
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
  // Verified addresses for haEUR (Harbor Anchored EUR)
  {
    peggedTokenSymbol: 'haEUR',
    peggedTokenAddress: '0x83Fd69E0FF5767972b46E61C6833408361bF7346', // haEUR token contract
    collateralPoolAddress: '0xe60054E6b518f67411834282cE1557381f050B13', // EUR/fxUSD Anchor Pool
    sailPoolAddress: '0xc5e0dA7e0a178850438E5E97ed59b6eb2562e88E', // EUR/fxUSD Sail Pool
    minterAddress: '0xDEFB2C04062350678965CBF38A216Cc50723B246', // EUR/fxUSD Minter
  },
  // haGOLD market - GOLD/fxUSD
  // Verified addresses for haGOLD (Harbor Anchored GOLD)
  {
    peggedTokenSymbol: 'haGOLD',
    peggedTokenAddress: '0x5b66D86932aE5D9751da588d91D494950554061d', // haGOLD token contract
    collateralPoolAddress: '0xC1EF32d4B959F2200efDeDdedadA226461d14DaC', // GOLD/fxUSD Anchor Pool
    sailPoolAddress: '0x5bDED171f1c08B903b466593B0E022F9FdE8399c', // GOLD/fxUSD Sail Pool
    minterAddress: '0x880600E0c803d836E305B7c242FC095Eed234A8f', // GOLD/fxUSD Minter
  },
];

// Chainlink price feed addresses on Ethereum mainnet
const CHAINLINK_FEEDS = {
  ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  BTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
  XAU_USD: '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6', // Gold/USD
  EUR_USD: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1', // EUR/USD
  XAG_USD: '0x379589227b15F1a12195D3f2d90bBc9F31f95235', // Silver/USD
};

// Mapping of pegged token symbols to their Chainlink price feed keys
// Used to determine which Chainlink feed to use for price lookups
const TOKEN_CHAINLINK_FEED_MAP = {
  'haBTC': 'BTC_USD',
  'haETH': 'ETH_USD',
  'haGOLD': 'XAU_USD',
  'haEUR': 'EUR_USD',
  'haSILVER': 'XAG_USD',
};

module.exports = {
  MARKETS,
  CHAINLINK_FEEDS,
  TOKEN_CHAINLINK_FEED_MAP,
};
