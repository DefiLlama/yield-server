# Valantis four-product yield PR handoff

Draft integration notes, prepared on 2026-10-26. Registration and server migration require a coordinated rollout with the companion TVL/dimension changes.

Website: https://www.valantis.xyz ; app: https://app.valantis.xyz ; X/Twitter: https://x.com/ValantisLabs ; restaking docs: https://docs.valantis.xyz/stakedhype/restaking . Final names/categories/logos and protocol IDs require registration coordination.

## Listings / required follow-up

Four independent wrappers: `valantis-sthype`, `valantis-sthype-stex`, `valantis-khype-stex`, `valantis-sthype-restaking`. Each uses the matching proposed TVL product slug, a stable contract-address/chain pool ID, and Hyperliquid L1. No new registered IDs were fabricated or borrowed from old listings.

**Before production activation**, register the approved slugs and add their assigned IDs as string literals inside each wrapper's `module.exports = { ... }`, spreading the shared adapter factory alongside the literal. The static yield-server-v2 loader cannot infer an ID from a dynamic factory alone. Full metadata tests currently fail by design until this is done; do not weaken them or use placeholder numeric IDs.

Companion TVL/dimension work migrates old stHYPE (`sthype`, ID 6457) and retires the combined STEX listing (`valantis-stex`, ID 5987), not an additional active product. Retain history and coordinate server mappings/parent stHYPE exclusions. Final identity and old-ID reuse decisions belong to maintainers/user, not this calculation implementation.

kHYPE STEX is paused/withdrawal-only, verified by the July 24, 2026 Paused event and live state. It returns residual assets and realized yield with an explicit status label. Confirm closed-to-deposits Yields eligibility before treating it as an active opportunity.

## Methodology

- Two archive snapshots roughly 24 hours apart; compound their index ratio with **actual** block elapsed seconds. Zero and negative realized returns are preserved. Missing state, zero/invalid rate denominators or insufficient deployed baseline throw, rather than fabricate zero APY.
- Review follow-up: the protocol has raised using a trailing seven-day realized window for smoother premium accrual. This draft still implements 24 hours; changing the window would use two seven-day-separated snapshots, not an average of daily annualizations.
- stHYPE index: HYPE value of a fixed raw-share amount, not changing totalSupply. Supply is used only for pool TVL. It is marked as the intrinsic stHYPE source.
- STEX index: net HYPE assets / LP supply. Includes retained trading fees, withdrawal spread, lending return and inventory-weighted LST appreciation exactly once. Reconstruct lens accounting directly so early snapshots do not depend on a later lens deployment. Mutable withdrawal-module discovery bypasses block-insensitive SDK address caching; original module getters are supported.
- Restaking index: active raw shares / ownership units, multiplied by stHYPE's raw-share exchange rate. Includes base yield and **released** premiums, not unvested reward funding. The result is reported once as realized `apyBase`, with no duplicate `apyReward`. Confirm field/intrinsic-linkage presentation with maintainers so downstream processing does not add base stHYPE yield again.
- Restaking `tvlUsd` includes active users only, excluding the seed, unreleased rewards **and pending withdrawals**. Pending claims earn ordinary stHYPE yield but no premium, so cannot dilute the active-pool return. Companion headline TVL includes active users plus pending withdrawals and is intentionally different.
- Restaking positions are nontransferable internal balances: `token: null`, not the escrow address as an ERC20. Cooldown is read on-chain (14 days in current testing).
- A historical annualization is not the current advertised premium, a promised return or a recurring-yield forecast. Donations, settlements and accounting changes can move realized NAV/share. No private-deal payment history was queried.

## Archive configuration

The official Hyperliquid RPC silently ignores old state tags. The adapter rejects a provider returning today's escrow code at block 1. Configure an archive-only list: SDK `HYPERLIQUID_RPC` prepends a provider **but also appends public fallbacks**. Local validation restricted `HYPERLIQUID_WHITELISTED_RPC` to the authorized archive endpoint; production needs equivalent archive-only routing. No credentials or project RPC URLs are hardcoded.

## Validation

```sh
node --test src/adaptors/valantis.unit.cjs
```

Seven unit tests pass, including signed compounding, cash-flow neutrality, seed/reserve exclusions, archive rejection and mutable module cache bypass.

From `src/adaptors`, with RPC configuration supplied securely:

```sh
npm run test --adapter=valantis-sthype --fast -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-sthype-stex --fast -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-khype-stex --fast -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-sthype-restaking --fast -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-sthype-stex --fast --timestamp=1748822400 -- --runInBand --transform '{}' test.js
```

All five fast smoke runs passed, including original-module STEX history ending June 2, 2025. Example live trailing-day APYs were approximately stHYPE 1.96%, stHYPE STEX 0.68%, kHYPE STEX 0%, restaking 11.74%; these are observations, not forward rates.

Full stHYPE and restaking suites were also run without `--fast`: data/schema/uniqueness checks passed, with exactly three failures for unregistered slug, missing matching protocol ID and missing literal protocol ID. They are **not** reported as full-suite passes. Repeat all four full suites after registration.

`--transform '{}'` bypasses an existing missing Babel runtime-plugin dependency in this checkout without adding a dependency or changing manifests. The harness prints a Jest open-handle warning after smoke tests; runs complete successfully. No package manifests, lockfiles or shared test harness files were modified.
