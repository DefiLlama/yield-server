# Valantis realized-yield integration

Updated November 2, 2026 after the companion TVL PR merged and all three product identities became live. No replacement TVL listings or combined-STEX retirement are requested.

Website: https://www.valantis.xyz ; app: https://app.valantis.xyz ; X/Twitter: https://x.com/ValantisLabs ; restaking docs: https://docs.valantis.xyz/stakedhype/restaking .

## Registered products

| Adapter / project slug | Literal protocol ID | Yield pools |
| --- | --- | --- |
| `sthype` | `6457` | stHYPE intrinsic staking yield |
| `valantis-stex` | `5987` | Separate stHYPE STEX and kHYPE STEX LP pools |
| `valantis-sthype-restaking` | `9281` | Active-user restaking pool |

Each wrapper supplies its registered ID as a string literal inside `module.exports = { ... }`, as required by the static loader. Contract-address/chain pool IDs remain unchanged; the two STEX pools share a product identity, not an exchange rate or pool ID. All three full metadata/data suites pass without weakening validation.

The existing stHYPE and combined STEX identities/history are retained. The live TVL parent exclusions now remove overlapping stHYPE in both STEX and restaking. Companion dimensions use the same product identities; their fee routing/refill is independent of these pool calculations.

kHYPE STEX is paused/withdrawal-only, verified by the July 24, 2026 Paused event and live state. It returns residual assets and realized yield with an explicit status label. Confirm closed-to-deposits Yields eligibility before treating it as an active opportunity.

## Methodology

- Two archive snapshots roughly 24 hours apart; compound their index ratio with **actual** block elapsed seconds. Zero and negative realized returns are preserved. Missing state, zero/invalid rate denominators or insufficient deployed baseline throw, rather than fabricate zero APY.
- Keep the existing trailing 24-hour calculation. A seven-day presentation remains an optional follow-up, not an unapproved change to this registration update.
- stHYPE index: HYPE value of a fixed raw-share amount, not changing totalSupply. Supply is used only for pool TVL. It is marked as the intrinsic stHYPE source.
- STEX index: net HYPE assets / LP supply. Includes retained trading fees, withdrawal spread, lending return and inventory-weighted LST appreciation exactly once. Reconstruct lens accounting directly so early snapshots do not depend on a later lens deployment. Mutable withdrawal-module discovery bypasses block-insensitive SDK address caching; original module getters are supported.
- Both STEX pools use the same observation blocks and price snapshot. Historical runs before kHYPE has a deployed 24-hour baseline return only the earlier stHYPE pool; unavailable state for an already-deployed pool still throws rather than returning partial data.
- Restaking index: active raw shares / ownership units, multiplied by stHYPE's raw-share exchange rate. Includes base yield and **released** premiums, not unvested reward funding. The result is reported once as realized `apyBase`, with no duplicate `apyReward`. Confirm field/intrinsic-linkage presentation with maintainers so downstream processing does not add base stHYPE yield again.
- Restaking `tvlUsd` includes active users only, excluding the seed, unreleased rewards **and pending withdrawals**. Pending claims earn ordinary stHYPE yield but no premium, so cannot dilute the active-pool return. Companion headline TVL includes active users plus pending withdrawals and is intentionally different.
- Restaking positions are nontransferable internal balances: `token: null`, not the escrow address as an ERC20. Cooldown is read on-chain (14 days in current testing).
- A historical annualization is not the current advertised premium, a promised return or a recurring-yield forecast. Donations, settlements and accounting changes can move realized NAV/share. No private-deal payment history was queried.

## Archive configuration

The official Hyperliquid RPC silently ignores old state tags. `HYPERLIQUID_RPC` alone prepends a provider **but also appends public fallbacks**, so the adapter now requires an explicit `HYPERLIQUID_WHITELISTED_RPC` list before SDK provider initialization. SDK-prefixed forms are honored with the SDK's normal precedence. Missing configuration and cached provider pools containing unapproved ordinary or archival fallbacks are rejected before observations are read.

The predeployment escrow-code check is applied directly to every configured candidate, not once through the aggregate provider. A latest-only or unavailable endpoint fails validation; state APIs must retain the validated provider identity. Block resolution, historical calls and native balances consequently share the same archive-only pool. Failover to another approved archive works; exhaustion of the approved pool fails rather than publishing an APY from public latest-only state. No RPC settings are mutated by the adapter and no credentials or project URLs are hardcoded.

The whitelist is passed through the trusted deploy workflow, `env.js` and `serverless.yml` into the adapter Lambda at startup. Set the optional `HYPERLIQUID_WHITELISTED_RPC` secret to a comma-separated archive-only list; when omitted, deployment restricts to the existing configured `HYPERLIQUID_RPC` value. This fallback is not an assertion of archival capability: its endpoint probes must still pass. No credentials are added to the untrusted PR workflow. Fork CI without access to an archive endpoint fails the explicit configuration guard if it executes these adapters; it does not silently switch to public RPCs. Local full-suite validation supplies the authorized archive whitelist at runtime.

The SDK whitelist is chain-wide for Hyperliquid in the shared adapter Lambda, so maintainers should provision endpoints suitable for its other Hyperliquid adapters too. Other chains and SDK provider settings are unchanged.

## Validation

```sh
node --test src/adaptors/valantis.unit.cjs
```

Sixteen unit tests pass, including signed compounding, cash-flow neutrality, seed/reserve exclusions, archive rejection, mutable module cache bypass, literal registered IDs and combined-pool history/failure handling. Review regressions cover explicit restaking `token === null`, the original-module getter, missing/mixed/cached RPC configuration, every endpoint's archive probe, SDK environment precedence and changed-provider rejection. A real SDK test uses local HTTP RPC fixtures to prove approved-archive failover for historical calls and native balances, with zero requests to a latest-only default; both archives failing produces an error. Deployment passthrough and secret-selection behavior are also tested without reading secrets.

From `src/adaptors`, with RPC configuration supplied securely:

```sh
npm run test --adapter=sthype -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-stex -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-sthype-restaking -- --runInBand --transform '{}' test.js
npm run test --adapter=valantis-stex --timestamp=1748822400 -- --runInBand --transform '{}' test.js
```

All four full runs passed, including original-module STEX history ending June 2, 2025 before kHYPE deployment. Current-suite test counts: 15 stHYPE, 24 combined STEX and 12 restaking; the historical suite has 15 checks. These include exact slug/ID/literal-ID validation, data types, pool-ID uniqueness and current public metadata.

Example November 2 trailing-day APYs were approximately stHYPE 1.95%, stHYPE STEX 1.00%, kHYPE STEX 0% and restaking 5.69%; these are observations, not forward rates. The remaining review questions are withdrawal-only kHYPE eligibility and confirming that downstream intrinsic-yield presentation does not add stHYPE yield twice.

`--transform '{}'` bypasses an existing missing Babel runtime-plugin dependency in this checkout without adding a dependency or changing manifests. Package manifests, lockfiles, PR CI and shared test assertions are unchanged. Trusted deployment edits only pass the archive whitelist to the runtime; the Valantis calculation and 24-hour methodology are unchanged. Concise function documentation describes the accounting and RPC contracts.
