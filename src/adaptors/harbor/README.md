# Harbor Adapter

This adapter fetches yield data from Harbor Finance protocol using on-chain contract calls.

## How Harbor Finance Works

Harbor Finance is a synthetic asset protocol that offers:
- **haTOKENS** (Harbor Anchored Tokens): Pegged synthetic assets that earn amplified yield (e.g., haETH, haBTC, haEUR, haGOLD, haMCAP, haSILVER)
- **Stability Pools**: Two types of pools that maintain system solvency and earn yield
  - **Collateral Pool**: Base yield pool
  - **Sail Pool**: Leveraged yield pool

Each market has both a Collateral Pool and a Sail Pool. Markets are available for both fxUSD and stETH pairs.

## APR Calculation

The adapter calculates APR from **reward streaming data**:

1. **Get Active Reward Tokens**: For each pool (collateral and sail), calls `activeRewardTokens()` to get the list of reward token addresses
2. **Get Reward Rates**: For each reward token, calls `rewardData(token)` to get:
   - `rate`: Reward rate per second (in token units with token's decimal precision)
   - `finishAt`: Timestamp when rewards end (to check if still active)
3. **Fetch Token Decimals**: Calls `decimals()` on each reward token to get its decimal precision
4. **Calculate Token APR**: For each reward token (using BigNumber for precision to avoid loss):
   - Annual rewards = `rate / 10**decimals * SECONDS_PER_YEAR`
   - Annual rewards USD = `annual rewards * reward token price`
   - Token APR = `(annual rewards USD / pool TVL) * 100`
5. **Sum APRs**: Total pool APR = sum of all individual reward token APRs
6. **Market APR**: For each market, uses the **lowest APR** between collateral and sail pools
7. **Final APR**: For tokens with multiple markets (e.g., haBTC), uses the **lowest APR** across all markets

## TVL Calculation

TVL is calculated from haTokens deposited in stability pools:

1. **Get Pool TVL**: Calls `totalAssets()` or `totalAssetSupply()` on each pool to get haToken amounts
2. **Get Token Price**: 
   - Fetches `peggedTokenPrice()` from minter contract (returns price in underlying asset, e.g., 1 haBTC = 1 BTC worth)
   - Fetches underlying asset price from **Chainlink price feeds** (same oracles used by the protocol)
     - ETH/USD: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`
     - BTC/USD: `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c`
     - XAU/USD (Gold): `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`
     - EUR/USD: `0xb49f677943BC038e9857d61E7d053CaA2C1734C1`
     - XAG/USD (Silver): `0x379589227b15F1a12195D3f2d90bBc9F31f95235`
     - TOT_MCAP/USD (Total Crypto Market Cap): `0xEC8761a0A73c34329CA5B1D3Dc7eD07F30e836e2`
   - Chainlink prices are in 8 decimals for USD pairs
   - Calculates USD price: `peggedTokenPriceUSD = peggedTokenPriceInUnderlying * underlyingAssetPriceUSD`
3. **Calculate Market TVL**: `(haTokens in Collateral Pool + haTokens in Sail Pool) × haToken Price USD`
4. **Group by Token**: Sums TVL across all markets for the same pegged token (e.g., haBTC has multiple markets)

## Pool Filtering

- Pools with TVL < $10,000 USD are filtered out (DefiLlama minimum threshold)

## Configuration

The adapter is configured with market contracts in the `config.js` file. The configuration includes:

1. **MARKETS array**: Market contract addresses for each pegged token
2. **TOKEN_CHAINLINK_FEED_MAP**: Mapping of token symbols to their Chainlink price feed keys

To add new markets, update both configurations in `src/adaptors/harbor/config.js`:

```javascript
const MARKETS = [
  {
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5',
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72',
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06',
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F',
  },
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7',
    collateralPoolAddress: '0x667Ceb303193996697A5938cD6e17255EeAcef51', // BTC/stETH market
    sailPoolAddress: '0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013',
    minterAddress: '0xF42516EB885E737780EB864dd07cEc8628000919',
  },
  // ... more markets (fxUSD and stETH pairs for each token)
];

const TOKEN_CHAINLINK_FEED_MAP = {
  'haBTC': 'BTC_USD',
  'haETH': 'ETH_USD',
  'haGOLD': 'XAU_USD',
  'haEUR': 'EUR_USD',
  'haSILVER': 'XAG_USD',
  'haMCAP': 'TOT_MCAP_USD',
};
```

**Important**: When adding a new token symbol, you must also add it to `TOKEN_CHAINLINK_FEED_MAP` with the appropriate Chainlink feed key. The adapter validates token symbols and will throw an error if an unsupported symbol is encountered.

### Address Verification

**IMPORTANT**: All contract addresses in the `MARKETS` array must be verified before merging changes:
- Verify against Harbor Finance official documentation: [Documentation](https://docs.harborfinance.io/)
- Verify contract addresses on [Etherscan](https://etherscan.io/)
- Ensure addresses match the correct pegged token symbol and market pair
- Addresses should be verified contracts on Ethereum mainnet

**Contract Deployment**: Harbor Finance contracts are deployed via a factory pattern using CREATE3:
- **Factory Contract**: [`0xD696E56b3A054734d4C6DCBD32E11a278b0EC458`](https://etherscan.io/address/0xD696E56b3A054734d4C6DCBD32E11a278b0EC458)
- Contracts are deterministically deployed through the BaoFactory using CREATE3 (Solady implementation)
- Addresses are predictable based on the factory address and deployment salt (salt values are specific to each deployment)
- The factory uses UUPS upgradeable pattern with a hardcoded owner address

The adapter includes verification comments mapping each address to its corresponding token symbol and market.

## Required Contract Methods

### Stability Pool Contracts

- `totalAssets()` or `totalAssetSupply()`: Returns `uint256` - Total haTokens deposited
- `activeRewardTokens()`: Returns `address[]` - Array of active reward token addresses
- `rewardData(address token)`: Returns `(uint256 lastUpdate, uint256 finishAt, uint256 rate, uint256 queued)`
  - `rate`: Reward tokens per second (in token units with token's decimal precision)
  - `finishAt`: Timestamp when reward period ends

### Minter Contracts

- `peggedTokenPrice()`: Returns `uint256` - Price of 1 pegged token in underlying asset units (18 decimals)
  - Example: 1 haBTC = 1 BTC worth, returns `1e18`

### ERC20 Token Contracts

- `decimals()`: Returns `uint8` - Token decimals

### Chainlink Price Feeds

The adapter uses Chainlink price feeds for underlying asset prices (consistent with the protocol's oracle usage):

- **ETH/USD**: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`
- **BTC/USD**: `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c`
- **XAU/USD** (Gold): `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`
- **EUR/USD**: `0xb49f677943BC038e9857d61E7d053CaA2C1734C1`
- **XAG/USD** (Silver): `0x379589227b15F1a12195D3f2d90bBc9F31f95235`
- **TOT_MCAP/USD** (Total Crypto Market Cap): `0xEC8761a0A73c34329CA5B1D3Dc7eD07F30e836e2`

**Required Methods:**
- `latestAnswer()`: Returns `int256` - Latest price in 8 decimals for USD pairs
  - Example: ETH at $3000 returns `300000000000` (3000 * 1e8)

**Note:** Reward token prices still use `coins.llama.fi` API as they may not have Chainlink feeds available.

## Testing

Test the adapter:

```bash
cd src/adaptors
npm run test --adapter=harbor
```

## Output Format

Each pool entry contains:
- `pool`: Unique identifier (format: `${peggedTokenAddress}-${chain}`)
- `chain`: Chain name (formatted using `utils.formatChain()`)
- `project`: 'harbor'
- `symbol`: Pegged token symbol (e.g., 'haETH', 'haBTC')
- `tvlUsd`: Total TVL in USD (summed across all markets for the token)
- `apyBase`: APR percentage (lowest across all markets and pools)
- `underlyingTokens`: Array containing the pegged token address
- `poolMeta`: Description (e.g., 'haBTC Stability Pool')
- `url`: Link to the protocol's app page (e.g., `https://app.harborfinance.io/anchor`)

## Protocol Information

- **Documentation**: [Documentation](https://docs.harborfinance.io/)
- **Protocol Type**: Synthetic asset protocol with stability pools
- **Chain**: Ethereum mainnet
- **Key Products**:
  - haTOKENS: Pegged synthetic assets (haETH, haBTC, haEUR, haGOLD, haMCAP, haSILVER)
  - Stability Pools: Collateral and Sail pools that earn yield from reward streaming
  - Markets: Available for both fxUSD and stETH pairs