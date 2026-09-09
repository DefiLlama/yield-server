# RHEA DEX yield adapter

This adapter publishes only pools 4514 (FRAX/USDC) and 4179
(USDt/USDC/USDT.e/USDC.e). Pool discovery is intentionally closed: every chain
pool must contain exactly the approved token address set, with no duplicate
addresses. Balances, token symbols, and quotes remain aligned to the token
order returned by the chain.

## Data sources

- `v2.ref-finance.near/get_pool` supplies token addresses and balances. Both
  calls use the same final NEAR block height.
- DefiLlama's current price service supplies token prices and decimals. A pool
  is omitted when any of its tokens lacks a valid quote.
- `https://api.rhea.finance/pool/search` is queried with
  `pool_id_list=4514,4179`. Its `fee_volume_24h` is the realized LP
  fee amount for the upstream rolling 24-hour window; `volume_24h` is exposed
  as one-day volume when it is finite and positive. The API TVL is used only
  as a comparison against the independently calculated chain TVL.

TVL is calculated from chain balances, token decimals, and prices. Base APY is
`fee_volume_24h / chain TVL * 365 * 100`; the fee amount is annualized once and
is not multiplied by another LP-share factor.

## Fee-share evidence and limitations

In the 2026-09-09 UTC source sample at NEAR block 214893096, both selected
pools had `fee_volume_24h / (volume_24h * indexer total_fee) = 80%`.
Both chain pool configurations reported a total fee of 2 basis points, and
`metadata()` returned `admin_fee_bps=2000` (20% of collected swap fees).
The sampled fee field is therefore already net LP fees. The runtime uses
that field directly without another 80% adjustment.

Pool 4514 was approximately $4,486 in that sample, below the repository's
stated $10,000 display threshold. The adapter still returns its valid data;
inclusion in this allowlist does not guarantee display on DefiLlama.

The upstream API does not document the exact start/end timestamps or update
cadence of its rolling 24-hour fee window. Its snapshot is also not atomic
with the final chain block. To prevent mixed-snapshot errors from being
published, the adapter omits a pool when the API TVL is missing, invalid, or
nonpositive, or when it differs from chain TVL by more than 1% of chain TVL.
That diagnostic records the block time, balances, quotes, and fee source.

Reward APY and reward tokens are omitted because they were not validated for
this phase. Each returned row links to `https://app.rhea.finance/sauce/<id>`.

## Verification

Run the focused Node tests explicitly because the repository's Jest discovery
does not include `.spec.cjs` files:

```sh
node --test src/adaptors/rhea-dex/*.spec.cjs
```

Run the repository's official adapter validator separately:

```sh
npm run test --adapter=rhea-dex -- --runInBand
```
