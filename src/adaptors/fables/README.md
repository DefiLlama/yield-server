# Fables native LP staking

One staking row per public funded pool on Robinhood Chain, covering liquid
FABLES emissions only. Staked receipts give up swap fees, so `apyBase` is omitted.
veFABLES voting income, rebase, company allocations, external campaigns and
unstaked liquidity are excluded.

## Pool identity and principal

The stable ID is `fables-staked-${poolId}-robinhood`. Each pool appears once;
there are no additional range rows. `tvlUsd` is **all marked staked principal**,
including out-of-range capital. The reward denominator is **marked in-range
staked principal**, not the reported total TVL. Empty pools are omitted;
all-out-of-range pools retain their TVL with zero current APR. Small ranges
remain in all accounting, without a display-size cutoff.

`token: null` is intentional: ERC-6909 shares are not an ERC-20 receipt token.
Native ETH is represented by WETH for token matching. The deposit link opens
the correct market, where the user chooses their range normally.

Pool rows with a separate reward denominator follow accepted CL adapters such
as [Aerodrome Slipstream](https://github.com/DefiLlama/yield-server/blob/85ae9fe121b9bd06c0b4287967174eee9e1bb0ab/src/adaptors/aerodrome-slipstream/index.js)
and [Velodrome v3](https://github.com/DefiLlama/yield-server/blob/85ae9fe121b9bd06c0b4287967174eee9e1bb0ab/src/adaptors/velodrome-v3/index.js).
Fables uses actual indexed staked ranges for its denominator. Unlike those
adapters' combined rates, this row includes **no swap-fee income**.

## Current in-range pool average APR

For the current hour, `H` is the published LP release: weekly LP budget / 168,
or budget times that hour's rhythm weight when configured. `D` is eligible
staked depth in raw token1 units and `R` is published reference depth:

`pool hourly FABLES = H * min(1, D / R)`

`apyReward = pool hourly FABLES * FABLES USD price * 8736 / in-range staked USD * 100`

This is **simple annualized current APR**, using 52 weeks (364 days), as the
app's staking headline does for a flat schedule. There is no compounding.
Future scheduled rhythms still use the actual current-hour rate; ignoring
them to match a flat UI headline would overstate or understate release.

Eligibility is `tickLower <= tick < tickUpper`, positive stake and positive
depth. A killed gauge pays zero. Depth values token0 at the integer tick,
capped at `referenceTick + 2232`; this cap does not reduce marked principal.
Budget division and depth scaling use integer flooring, as in the stream.
Rebase/company percentages validate the allocation file but never enter LP
yield. Its reservation must fit within the on-chain weekly allowance; unused
allowance is not treated as paid emissions.

Ranges share emissions by eligible raw liquidity, not dollar capital. The
pool rate is their capital-weighted in-range average before owner-level
integer dust. Individual ranges can earn more, less or zero. A new deposit
changes depth and dilution. This is not a personal quote, realized income,
claimable balance or a promise of future yield. Real settlement integrates
events and floors per owner, rather than freezing this instantaneous book.

## Sources and cadence

- Pool keys/active registry, gauge state and weekly allowance: batched SDK
  chain reads at the sampled indexed head. No private RPC credentials.
- Range books and sqrt prices: existing `/api/indexer?op=stakeddepth`
  fixed-query Envio proxy. It returns indexed facts, not calculated APRs.
  Queries group eight pools; a saturated 1,000-row response splits by pool
  instead of joining changing offset pages. A saturated single pool fails.
- Allocation/depth/rhythm: public `launch-config.json` pointer and
  `budgets/<current epoch>.json` in the existing fables-proofs bucket. These
  off-chain per-pool policy inputs cannot be recovered from the global
  on-chain allowance. Their use is explicitly disclosed for maintainer review.
- USD marks/decimals: DefiLlama prices API. Missing, over-three-hour-old or
  low-confidence marks omit the affected pool. No assumed stablecoin peg or
  stale budget-file FABLES price is substituted. Independent marks and timing
  can differ from the app; aligned marks/books give the same flat-schedule
  formula, apart from integer rounding.

The intended cadence is the normal hourly adapter job, not a browser poll.
Calls are batched/sequential with timeouts. Pool aggregation adds no reads.
There is no per-wallet polling, historical RPC sweep or new Fables endpoint.
Index lag and CDN age over five minutes, held responses and epoch mismatches
are refused. Books have no individual block stamps: this is recent indexed
data, **not a globally atomic block snapshot**. A separate head check cannot
certify every book's block or eliminate differences within the cache window.

## Maintenance and review

DefiLlama maintainers should review the fixed-query proxy and off-chain budget
source. A direct block-stamped subgraph would improve auditability, but this
adapter introduces no production feed or private credential.

Fables/Yanis should own weekly publication/schema changes, token-price
coverage, gauge/contract changes and public market openings. Two funded
partner-only pools are explicitly excluded until their public routes open;
future prelaunch gauges need the same listing review. Missing valuations are
coverage gaps, not evidence of zero yield.

## Checks

`node src/adaptors/fables/checks.cjs` runs offline accounting and aggregation
tests. The repository suite is `npm run test --adapter=fables` from
`src/adaptors` on its supported environment. Schema assertions do not prove
methodology acceptance or realized payouts. This PR changes only the adapter;
no Fables application, contract, indexer or deployment changes are required.
