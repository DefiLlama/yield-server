# Rujira AMM strategies

CCL and DCL yield pools use Rujira's authoritative
[Analytics v2 API](https://analytics.rujira.network/api/v2/graphql).
Each FIN pair and strategy type is a separate pool. IDs use the FIN contract
address plus a CCL or DCL suffix, so the two strategies never share an ID.

- `tvlUsd`: the strategy's current USD TVL.
- `apyBase`: the pair and strategy's annualized yield over one completed UTC
  day, converted from a decimal ratio to a percentage. It uses
  `apr(range: { trailing: { unit: DAY, value: 1 } })`, following DeFiLlama's
  24-hour window for fee-based yields. The API blends performance across the
  pair's selected strategy; each pair and type keeps its own rate.

Rates are annualized source rates; the adapter adds no assumed compounding or
incentive yield. Pools with no TVL or unavailable 24-hour yield are omitted.
A funded pool with a measured 0% yield is included.

DCL is discovered and processed through the same query and mapping as CCL.
There is no DCL zero-rate placeholder: funded DCL pools become available
automatically when the API provides their yield.

The adapter reuses Rujira's existing request/retry, chain, symbol and URL helpers.
Staking and money-market adapters retain their own sources and behavior.
CCL/DCL positions have no shared fungible LP token, so `token` is explicitly null.
