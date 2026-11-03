# Fables native LP staking — draft methodology

This adapter covers liquid FABLES emissions to staked LP receipts on Robinhood
Chain. It does **not** add swap-fee yield: staked receipts give up those fees.
It excludes veFABLES voting income, veFABLES rebase, company allocations, Merkl
campaigns and unstaked liquidity.

## Row identity and principal

One row is one existing **staked ERC-6909 range** on its hook, identified by
`keccak256(abi.encode(poolId, tickLower, tickUpper))`. All holders of that range
have the same raw-liquidity-per-capital ratio. Its `tvlUsd` is the current value
of its **staked** token principal, including principal outside the price range.
The entire pool TVL is never repeated across range rows. Empty ranges are omitted;
funded out-of-range rows have zero current emission APR. Sub-$10k ranges remain
in the calculation even though DefiLlama hides them in the UI.

`token: null` is intentional: a hook is not an ERC-20 receipt token. The pool
identifier carries the hook and range ID; underlying tokens and FABLES are
ordinary ERC-20 addresses. Native ETH is represented by WETH for token matching.

## Rate

For the current hour, let `H` be the pool's published FABLES release: weekly LP
budget / 168, or budget × that hour's published rhythm weight. Let `D` be its
eligible staked depth in raw token1 units, `R` its published reference depth and
`S` its total eligible raw staked liquidity. Then a range with liquidity `L` gets:

`hourly FABLES = H × min(1, D / R) × L / S`

Eligibility is `tickLower <= tick < tickUpper`, positive stake and positive depth;
a killed gauge pays zero. Depth values token0 at the tick, capped at
`referenceTick + 2232`. It is distinct from marked principal TVL. Integer flooring
matches the stream's one-hour calculation on an aggregate range. Real settlement
floors per owner and accrues between events, so tiny rounding differences remain.

`apyReward = hourly FABLES × current FABLES USD price × 8760 / range TVL × 100`.
This is **simple annualized current APR**, not compounding APY, past realized
income, claimable balance or a year-long forecast. A new deposit changes depth
and liquidity share; this quote describes the existing range before that
deposit. It is not the capital-weighted pool average or a rate attainable in
every range. Price movement can take a range out of eligibility entirely.

Rebase/company percentages validate the allocation file but never enter LP
yield. The file's reservation must fit within the on-chain weekly allowance;
unused allowance is not treated as paid emissions.

## Public sources and cadence

- Pool keys/active registry, gauge state and weekly allowance: batched SDK chain
  reads at the indexed head. No private RPC credentials or per-wallet reads.
- Range books and pool prices: existing `/api/indexer?op=stakeddepth` fixed-query
  proxy to Envio. It returns indexed facts, not calculated APRs. Books are grouped
  eight pools per request; a saturated 1,000-row response is split by pool rather
  than joining changing offset pages. A single pool over that limit fails closed.
- Off-chain allocation/depth/rhythm: public `launch-config.json` pointer and
  `budgets/<current epoch>.json` in the existing fables-proofs bucket. These
  per-pool policy inputs cannot be recovered from the contract's global ceiling.
- USD marks/decimals: DefiLlama prices API. Missing, over-three-hour-old or
  low-confidence prices omit the affected rows. No assumed $1 or old budget mark.

Intended cadence is the normal hourly adapter job, not a browser poll. Calls are
batched/sequential and have timeouts; no retry storm, historical RPC sweep or
new Fables endpoint is introduced. Index lag and CDN age over five minutes, held
outage responses and epoch mismatches are refused. The proxy does not expose a
block stamp on each book, so this is a recent indexed snapshot, **not** a
globally atomic block snapshot. The sampled books can differ by the cache window.

## Review gates before merging

1. Maintainer agreement on range rows and current simple APR under Yields' CL
   methodology. Substituting a pool-wide average would overstate broad-range yield.
2. Acceptance of the existing fixed-query Envio proxy and unavoidable public
   off-chain budget source. A direct public block-stamped subgraph would improve
   snapshot auditability; this PR does not create one or expose its private key.
3. The deposit URL opens the correct market, but currently does **not** preselect
   the exact ticks. The user must select the displayed range. Agree whether that
   is sufficient before listing. No unsupported tick URL parameters are invented.
4. Fables/Yanis should own maintenance: weekly publication/schema changes,
   newly listed tokens' price coverage, gauge/contract changes and public market
   openings. Two funded partner-only markets are explicitly excluded until their
   public routes open; future prelaunch gauges need the same listing review.

## Checks

`node src/adaptors/fables/checks.cjs` runs offline accounting/edge-case tests.
Run the repository's adapter suite with `npm run test --adapter=fables` from
`src/adaptors` on its supported environment. No application files, deployments,
contracts, indexer handlers or production configuration are changed by this PR.
