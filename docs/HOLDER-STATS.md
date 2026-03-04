# Holder Stats System

Daily holder distribution metrics for DeFi pools, sourced from an external holder API.

## What It Does

Fetches holder data from `peluche2.llamao.fi/holders` for EVM tokens across supported chains. Derives four metrics per pool every day:

| Metric | Description |
|--------|-------------|
| `holderCount` | Total unique holders (from API) |
| `avgPositionUsd` | TVL / holderCount |
| `top10Pct` | % of total supply held by the 10 largest wallets |
| `top10Holders` | The 10 largest wallets with their balances |

The API also computes **holderChange7d** and **holderChange30d** — the net change in holder count over those windows.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      6 AM UTC (daily)                       │
│                                                             │
│  triggerHoldersDaily (single Lambda, 300s timeout)          │
│  ├─ getEligiblePools() — all pools with TVL >= $10k        │
│  ├─ Filter to valid EVM pools on supported chains           │
│  ├─ Batch erc20:totalSupply multicall per chain             │
│  ├─ For each pool (10 concurrent):                          │
│  │   ├─ fetchHolders(chainId, token) → external API         │
│  │   ├─ Derive metrics (holderCount, avgPositionUsd, etc.)  │
│  │   └─ insertHolder() → upsert daily snapshot              │
│  └─ Log success/failure counts                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                             │
│                                                             │
│  holder_daily   — one row per pool per day                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      REST API                               │
│                                                             │
│  GET /holders              — latest snapshot for all pools  │
│  GET /holderHistory/:pool  — daily time series for one pool │
│                                                             │
│  (responses cached in Redis for 1 hour)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Table

### `holder_daily`

One row per pool per day. The unique index on `(configID, timestamp DESC)` prevents duplicate snapshots from re-runs.

| Column | Type | Notes |
|--------|------|-------|
| `holder_id` | uuid | PK, auto-generated |
| `configID` | uuid | FK → config table |
| `timestamp` | timestamptz | Always midnight UTC |
| `holderCount` | integer | |
| `avgPositionUsd` | numeric | |
| `top10Pct` | numeric | |
| `top10Holders` | jsonb | Array of `{address, balance, balancePct}` |

---

## API Endpoints

### GET `/holders`

Returns the latest snapshot for every pool, plus 7d/30d holder count changes.

```json
{
  "status": "success",
  "data": {
    "config-uuid-1": {
      "holderCount": 15234,
      "avgPositionUsd": 6543,
      "top10Pct": 45.67,
      "holderChange7d": 234,
      "holderChange30d": 1234
    }
  }
}
```

### GET `/holderHistory/:pool`

Returns the full daily time series for a single pool (by configID).

```json
{
  "status": "success",
  "data": [
    {
      "timestamp": "2025-06-18T00:00:00.000Z",
      "holderCount": 14800,
      "avgPositionUsd": 6200.50,
      "top10Pct": 46.12
    }
  ]
}
```

Both endpoints are cached by Redis for 1 hour.

---

## File Map

```
migrations/
  1771242161000_add-holder-tables.js    Schema: holder_daily

src/queries/
  holder.js                             All DB read/write functions

src/utils/
  holderApi.js                          External API client + chain resolution

src/handlers/
  triggerHoldersDaily.js                Daily orchestrator (Lambda, 6 AM UTC)

src/api/
  controllers/yield.js                  getHolders, getHolderHistory controllers
  routes/yield.js                       Route definitions
  app.js                                Express app + Redis cache middleware
```

---

## Supported Chains

All chains supported by the DefiLlama SDK indexer v2: ethereum, optimism, bsc, polygon, arbitrum, base, avalanche, fantom, gnosis, linea, blast, scroll, sonic, hyperliquid, monad, megaeth, berachain, unichain, soneium, polygon_zkevm, op_bnb, mode, arbitrum_nova, era.

Only EVM chains with ERC-20 tokens are supported. Non-EVM pools (Solana, etc.) and multi-address LP tokens are automatically skipped.
