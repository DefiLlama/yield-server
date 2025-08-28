# SparkDEX Adapter

This adapter provides yield information for the SPRK token staking protocol on the Flare network.

## Overview

SPRK token holders can stake their tokens to receive xSPRK (escrowed tokens). By allocating xSPRK, users can earn dividends from various distributed tokens.

## Token Addresses

- **SPRK Token**: `0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0`
- **xSPRK (Escrowed)**: `0xB5Dc569d06be81Eb222a00cEe810c42976981986`
- **Dividends Smart Contract**: `0x710a578356A3Dfa7C207B839D3E244807b2f5AFE`

## How It Works

1. **Staking**: Users stake SPRK tokens to receive xSPRK
2. **Allocation**: Users allocate their xSPRK to start earning dividends
3. **Dividends**: Users earn dividends from distributed tokens based on their allocation
4. **Epoch**: Dividends are distributed every 7 days

## APY Calculation

The adapter calculates APR (not APY) since this is not an auto-compounding protocol:

```
APR = (Current Distribution USD / TVL USD) * (365 days / 7 days) * 100
```

Where:
- **Current Distribution USD**: Total value of tokens being distributed in the current epoch
- **TVL USD**: Total value of allocated xSPRK tokens
- **Epoch Duration**: 7 days

## Data Sources

### Current Implementation (Testing)
- Uses mock data for testing purposes
- Simulates distributed tokens and allocations
- Includes fallback price data

### Production Implementation
- Should fetch data from smart contracts:
  - `distributedTokensLength` from dividends SC
  - `distributedTokens` array from dividends SC
  - `totalAllocation` (xSPRK amount) from dividends SC
  - `currentDistribution` for each token from dividends SC

### Price Data
- Primary: DefiLlama Price API (`https://coins.llama.fi/prices/current/flare:{token}`)
- Fallback: FlareMetrics API
- Mock prices for testing

## Pool Information

- **Pool ID**: `0xb5dc569d06be81eb222a00cee810c42976981986-flare`
- **Symbol**: `xSPRK`
- **Project**: `SparkDEX`
- **Chain**: `flare`
- **Underlying Token**: xSPRK
- **Reward Tokens**: All distributed tokens (WFLR, USDC.e, USDT, etc.)

## Testing

The adapter includes comprehensive test coverage:
- Field validation
- Data type checks
- APY calculations
- Token validation
- Pool uniqueness

## Future Improvements

1. **Smart Contract Integration**: Replace mock data with actual contract calls
2. **Real-time Updates**: Implement real-time data fetching
3. **Historical Data**: Add historical APY tracking
4. **Gas Optimization**: Optimize contract calls for gas efficiency

## Notes

- This is not an auto-compounding protocol, so APR is used instead of APY
- TVL is calculated based on allocated xSPRK, not staked SPRK
- The adapter handles cases where price data might be unavailable
- Mock data is used for testing but should be replaced with real data in production
