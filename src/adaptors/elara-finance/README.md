# Elara Finance yield adapter

Reports the Ethereum sElUSD staking pool for protocol `8336` (`elara-finance`).

- `apyBase`: compounded annualized change in on-chain sElUSD share price over
  the past 7 days, using the actual elapsed time between sampled blocks.
  Share prices reflect distributed yield after fees. Negative returns are
  preserved. There are no separate reward tokens, so `apyReward` is omitted.
- `tvlUsd`: accounted staked elUSD from `totalElUSD()`, multiplied by the elUSD
  USD price from DefiLlama. Missing or invalid prices fail the adapter rather
  than silently assuming a $1 peg.
- `pricePerShare`: current on-chain elUSD per sElUSD.

The dashboard uses a fixed July 10 baseline, so its APY can differ from this
rolling yield metric. Payout timing produces zero-return 24-hour windows, so a
7-day window is used to smooth irregular distributions.

Run the standard DefiLlama checks from `src/adaptors`:

```sh
npm run test --adapter=elara-finance
```
