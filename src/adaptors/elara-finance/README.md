# Elara Finance yield adapter

Reports the Ethereum sElUSD staking pool for protocol `8336` (`elara-finance`).
This is a separate yield-server submission from the existing TVL and fee adapters.

- `apyBase`: compounded annualized sElUSD share-price growth, after fees already
  reflected in the staking contract. There are no separate token rewards, so
  `apyReward` is omitted. Neither field is an APR field.
- Baseline: 1 elUSD per sElUSD at `2026-07-10T00:26:59Z`, matching the Elara
  dashboard's configured baseline. Formula:
  `((sharePrice / 1e18) ** (31536000 / elapsedSeconds) - 1) * 100`.
- The endpoint of the window is the sampled Ethereum block. The dashboard uses
  its latest indexed payout timestamp, so the displayed rates can differ between
  payouts or while indexing catches up. This is a since-baseline annualization,
  not a trailing 7-day or 30-day rate. Negative returns are preserved rather than
  clamped to zero as in the dashboard backend.
- `tvlUsd`: `totalElUSD() / 1e18`, valuing elUSD at its $1 peg. This is a nominal
  peg valuation, not a market-price feed. It excludes unstaked elUSD, unrelated
  treasury assets, and unaccounted direct transfers to the staking contract.
- `pricePerShare`: on-chain elUSD per sElUSD. All reads use the same block.

Focused calculation checks, from the repository root:

```sh
node --test scripts/check-elara-finance.cjs
```

DefiLlama integration checks:

```sh
cd src/adaptors
npm install
npm run test --adapter=elara-finance
```

Publication requires submitting the adapter to DefiLlama/yield-server and having
it accepted and ingested. Adding this local file does not change the live listing
or add an APR-labeled chart to DefiLlama's protocol page.
