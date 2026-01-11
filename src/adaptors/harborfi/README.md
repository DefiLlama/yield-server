# HarborFi Adapter

This adapter fetches yield data from Harbor Finance protocol using on-chain contract calls.

## How Harbor Finance Works

Harbor Finance is a synthetic asset protocol that offers:
- **haTOKENS** (Harbor Anchored Tokens): Pegged synthetic assets that earn amplified yield (e.g., haETH, haBTC)
- **Stability Pools**: Two types of pools that maintain system solvency and earn yield
  - **Collateral Pool**: Base yield pool
  - **Sail Pool**: Leveraged yield pool

Each market has both a Collateral Pool and a Sail Pool.

## APR Calculation

The adapter calculates APR from **reward streaming data**:

1. **Get Active Reward Tokens**: For each pool (collateral and sail), calls `activeRewardTokens()` to get the list of reward token addresses
2. **Get Reward Rates**: For each reward token, calls `rewardData(token)` to get:
   - `rate`: Reward rate per second (in wei, 18 decimals)
   - `finishAt`: Timestamp when rewards end (to check if still active)
3. **Calculate Token APR**: For each reward token:
   - Annual rewards = `rate * SECONDS_PER_YEAR / 1e18`
   - Annual rewards USD = `annual rewards * reward token price`
   - Token APR = `(annual rewards USD / pool TVL) * 100`
4. **Sum APRs**: Total pool APR = sum of all individual reward token APRs
5. **Market APR**: For each market, uses the **lowest APR** between collateral and sail pools
6. **Final APR**: For tokens with multiple markets (e.g., haBTC), uses the **lowest APR** across all markets

## TVL Calculation

TVL is calculated from haTokens deposited in stability pools:

1. **Get Pool TVL**: Calls `totalAssets()` or `totalAssetSupply()` on each pool to get haToken amounts
2. **Get Token Price**: 
   - Fetches `peggedTokenPrice()` from minter contract (returns price in underlying asset, e.g., 1 haBTC = 1 BTC worth)
   - Fetches underlying asset price (BTC/ETH) from **Chainlink price feeds** (same oracles used by the protocol)
     - ETH/USD: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`
     - BTC/USD: `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c`
   - Chainlink prices are in 8 decimals for USD pairs
   - Calculates USD price: `peggedTokenPriceUSD = peggedTokenPriceInUnderlying * underlyingAssetPriceUSD`
3. **Calculate Market TVL**: `(haTokens in Collateral Pool + haTokens in Sail Pool) × haToken Price USD`
4. **Group by Token**: Sums TVL across all markets for the same pegged token (e.g., haBTC has multiple markets)

## Pool Filtering

- Pools with TVL < $10,000 USD are filtered out (DefiLlama minimum threshold)

## Configuration

The adapter is configured with market contracts in the `MARKETS` array:

```javascript
const MARKETS = [
  {
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5',
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72',
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06',
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F',
  },
  // ... more markets
];
```

## Required Contract Methods

### Stability Pool Contracts

- `totalAssets()` or `totalAssetSupply()`: Returns `uint256` - Total haTokens deposited
- `activeRewardTokens()`: Returns `address[]` - Array of active reward token addresses
- `rewardData(address token)`: Returns `(uint256 lastUpdate, uint256 finishAt, uint256 rate, uint256 queued)`
  - `rate`: Reward tokens per second (in wei, 18 decimals)
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

**Required Methods:**
- `latestAnswer()`: Returns `int256` - Latest price in 8 decimals for USD pairs
  - Example: ETH at $3000 returns `300000000000` (3000 * 1e8)

**Note:** Reward token prices still use `coins.llama.fi` API as they may not have Chainlink feeds available.

## Testing

Test the adapter:

```bash
cd src/adaptors
npm run test --adapter=harborfi
```

## Output Format

Each pool entry contains:
- `pool`: Unique identifier (format: `${peggedTokenAddress}-${chain}`)
- `chain`: Chain name (formatted using `utils.formatChain()`)
- `project`: 'harborfi'
- `symbol`: Pegged token symbol (e.g., 'haETH', 'haBTC')
- `tvlUsd`: Total TVL in USD (summed across all markets for the token)
- `apyBase`: APR percentage (lowest across all markets and pools)
- `underlyingTokens`: Array containing the pegged token address
- `poolMeta`: Description (e.g., 'Combined from 2 market(s)')

## Protocol Information

- **Documentation**: https://docs.harborfinance.io/
- **Protocol Type**: Synthetic asset protocol with stability pools
- **Chain**: Ethereum mainnet
- **Key Products**:
  - haTOKENS: Pegged synthetic assets (haETH, haBTC)
  - Stability Pools: Collateral and Sail pools that earn yield from reward streaming
