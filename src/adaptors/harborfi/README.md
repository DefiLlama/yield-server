# HarborFi Adapter Setup Guide

This adapter is designed to fetch yield data from Harbor Finance protocol. The adapter supports three data source options:

1. **Subgraph** (Recommended if available)
2. **API Endpoint**
3. **On-chain Contract Calls**

## How Harbor Finance APR Works

Harbor Finance uses a dual-pool system for each market:

1. **Collateral Pool** (`stabilityPoolCollateral`): Base yield pool
2. **Sail Pool** (`stabilityPoolLeveraged`): Leveraged yield pool

Each pool has an APR with two components:
- `collateral`: Base APR from collateral yield (stored as `apyCollateral`)
- `steam`: Additional APR component (stored as `apySteam`)
- **Total Pool APR** = `collateral + steam`

The adapter combines both pools' APRs to calculate the final displayed APR:
- **Final APR** = Average of (Collateral Pool APR, Sail Pool APR)
- This matches how the frontend calculates and displays APRs

## Required Configuration

To complete the adapter setup, you need to provide the following information:

### 1. Blockchain Networks

Update the `CHAINS` object in `index.js` with the chains where HarborFi is deployed:

```javascript
const CHAINS = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  // Add more chains as needed
};
```

### 2. Data Source (Choose ONE of the following)

#### Option A: Subgraph (Recommended)

If Harbor Finance has a subgraph, provide the URL:

```javascript
const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/harborfi/harborfi';
```

**Required Subgraph Schema:**

Preferred structure - `markets` query should return:
- Each market with: `id`, `minterAddress`, `peggedToken` (with `id`, `symbol`, `decimals`), `chain`
- `collateralPool`: `id`, `address`, `totalValueLockedUSD`, `apyCollateral`, `apySteam`
- `sailPool`: `id`, `address`, `totalValueLockedUSD`, `apyCollateral`, `apySteam`

Fallback structure - `stabilityPools` query should return:
- `id`, `address`, `marketId`, `poolType` ('collateral' or 'sail'), `token` (with `id`, `symbol`, `decimals`), `totalValueLockedUSD`, `apyCollateral`, `apySteam`, `chain`

#### Option B: API Endpoint

If Harbor Finance provides a REST API:

```javascript
const API_BASE_URL = 'https://api.harborfinance.io/v1';
```

**Required API Endpoints:**

Preferred:
- `GET /markets?chain={chain}` - Returns array of markets, each with `collateralPool` and `sailPool` objects

Fallback:
- `GET /stability-pools?chain={chain}` - Returns array of pools with `marketId` and `poolType` to group by market

Each market/pool object should include:
- `peggedToken` or `token`: `address`, `symbol`, `decimals`
- `collateralPool`: `tvlUsd`, `apyCollateral`, `apySteam` (or `apyBase`, `apyReward`)
- `sailPool`: `tvlUsd`, `apyCollateral`, `apySteam` (or `apyBase`, `apyReward`)

#### Option C: On-chain Contract Calls

If you need to query contracts directly:

```javascript
const CONTRACTS = {
  ethereum: [
    {
      minterAddress: '0x...', // Minter contract address
      collateralPoolAddress: '0x...', // Collateral stability pool address
      sailPoolAddress: '0x...', // Sail stability pool address (optional if not deployed)
      peggedTokenAddress: '0x...', // haTOKEN address (e.g., haETH, haBTC)
      peggedTokenSymbol: 'haETH', // Symbol for display
    },
    // Add more markets as needed
  ],
  // Add more chains as needed
};
```

**Required Contract Methods:**

For each stability pool (both collateral and sail):
- `totalAssets()` or `totalAssetSupply()`: Returns `uint256` - Total TVL
- `APR()`: Returns `[uint256, uint256]` - Array of [collateralAPR, steamAPR] in 1e16 units
  - Formula: `APR = (result[0] / 1e16) * 100 + (result[1] / 1e16) * 100`

The adapter will automatically:
1. Query both pools for each market
2. Calculate combined TVL (collateral + sail)
3. Average the APRs from both pools

## Testing

After configuration, test the adapter:

```bash
cd src/adaptors
npm run test --adapter=harborfi
```

## Data Requirements

Each pool should return (one pool per market, combining both collateral and sail pools):
- `pool`: Unique identifier (format: `${peggedTokenAddress}-${chain}`)
- `chain`: Chain name (use `utils.formatChain()`)
- `project`: 'harborfi'
- `symbol`: Pegged token symbol (e.g., 'haETH', 'haBTC')
- `tvlUsd`: Combined TVL in USD (collateral pool + sail pool)
- `apyBase`: Combined/averaged APY from both pools (collateral + sail averages)
- `underlyingTokens`: Array containing the pegged token address
- `poolMeta`: 'Combined Collateral & Sail Pools'

## Protocol Information

- **Documentation**: https://docs.harborfinance.io/
- **Protocol Type**: Synthetic asset protocol with stability pools
- **Key Products**:
  - haTOKENS (Harbor Anchored Tokens): Pegged synthetic assets
  - hsTOKENS (Harbor Sail Tokens): Leverage tokens
  - Stability Pools: Collateral and Sail pools that earn yield

## Need Help?

If you need to modify the adapter structure or add additional features, refer to other adapters in the `src/adaptors/` directory for examples.
