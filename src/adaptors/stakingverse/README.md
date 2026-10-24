# Stakingverse Ethereum vault

This adapter covers only the public, non-ERC20 Ethereum vault
[`0x8a93a876912c9f03f88bc9114847cf5b63c89f56`](https://app.stakewise.io/vault/mainnet/0x8a93a876912c9f03f88bc9114847cf5b63c89f56),
under the existing `stakingverse` protocol (ID `6082`). It does not report LUKSO/LYX.
The pool has no transferable vault receipt token, so `token: null` is explicit.

## TVL: active positions, net of fee-adjusted osETH debt

All contract reads use one Ethereum block. GraphQL entity queries are pinned to
that block's hash, with the number, hash and timestamp cross-checked against RPC.

- `A`: on-chain `totalAssets()`.
- `S`: on-chain `totalShares()`.
- `Q`: `getExitQueueData().queuedShares`.
- `D`: sum of on-chain `osTokenPositions(owner)` over **all historical allocator
  addresses**, including zero-share accounts, plus the current fee recipient and
  the vault's seed-share address, deduplicated.

```
activeAssets = floor((S - Q) * A / S) = convertToAssets(S - Q)
tvlUsd = (activeAssets * ETHprice - D * osETHprice) / 1e18
```

Both asset expressions must agree. The sum of each owner's `getShares()` must
reconcile to `S - Q`. Values stay integers until market valuation. `osTokenPositions`
includes accrued controller fees in its view calculation; the deduction is
fee-adjusted debt, not a claim of exact cancellation against an asynchronous
snapshot of globally minted osETH. There is no fallback from osETH price to ETH.

**Every exit leaves this perimeter on queue entry**, including ordinary exits and
osETH escrow transfers. In the latter transaction, the owner's corresponding
debt moves to escrow as its collateral enters the exit queue. Checkpoints reduce
`S` and `Q` together, and remove the reserved assets from `A`. Partial/full
checkpoints, settled-but-unclaimed collateral, partial escrow claims and residual
escrow collateral remain outside. Escrow debt must not be subtracted again.
Legacy exiting assets were already removed from `A`; there is no add-back.
Checkpoint rounding can alter the active share value by actual contract rounding
amounts, so exact asset-value invariance is not assumed.

This is a market-valued, double-counting-adjusted **active-pool** TVL. It is not
consolidated protocol equity, immediate withdrawal liquidity or the denominator
of a leveraged user's return. Raw on-chain assets can exclude rewards not yet
harvested. No simulated subgraph asset/share balances are mixed into this TVL.

## Source and account completeness

The pinned production subgraph deployment is
[`QmYHxQPCDK7C6ttWi5DvQufttFXU4xFTVy7YLydspUY86d`](https://ipfs.stakewise.io/ipfs/QmYHxQPCDK7C6ttWi5DvQufttFXU4xFTVy7YLydspUY86d).
It was reproduced from unchanged public source at
[`stakewise/v3-subgraph@af016c4c24155aa57611337daf70322909c335b8`](https://github.com/stakewise/v3-subgraph/tree/af016c4c24155aa57611337daf70322909c335b8),
with its committed lockfile and Node 24.6.0. All 101 manifest references and all
70 unique objects including the root manifest matched their deployed bytes/CIDs.
This proves source-to-artifact equivalence, not a full replay of Ethereum indexing.

For this non-Genesis/non-ERC20 vault, deposits and fee-share synchronization create
allocator entities, minting requires the existing allocator, and no allocator is
deleted when balances reach zero. The factory configuration covers its creation
at block 18,612,909. The adapter scans all allocator entities without balance/debt
filters. A zero-collateral account can retain debt after liquidation: share-supply
reconciliation alone is not a debt-completeness proof, which is why the persistent
historical entity set and deployment pin matter.

The EIP-1967 implementation is also pinned to
[`0x927a83c679a5e1a6435d6bfaef7f20d4db23e2cc`](https://eth.blockscout.com/address/0x927A83c679A5e1a6435D6BfaEF7F20D4db23e2cC?tab=contract),
which reports contract version `5`. It corresponds to the official
[v4.0.1 release source](https://github.com/stakewise/v3-core/tree/c511cd912cb881f60cf2a32d6c5d5f533e5d04b5),
not a release called v5. Relevant implementation source was compared with the
explorer-published source (partial verification); this adapter does not claim a separate Solidity
compiler reproduction or a new security audit.

## Yield period and fees

`apyBase` is the arithmetic mean of exactly seven consecutive daily
`vaultSnapshots.apy` values from the pinned deployed subgraph. Each source value
annualizes the change in the value of a fixed quantity of vault shares using the
actual elapsed sampling seconds. The source calls it APY, but uses simple
annualization, not exponential compounding. It is an unleveraged historical
staking rate, not an osETH-borrowing or boosted-return forecast.

The subgraph can simulate a harvest when valuing those historical shares. Fee
share dilution is already included; the vault fee is not subtracted again. No
extra incentives, points, leverage or assumed compounding are added. Reading the
snapshot series avoids the independently refreshed `vault.baseApy` cache.

The deployed handler samples in the last 30 seconds of a UTC day and labels the
sample with that day's midnight in integer microseconds. At indexed timestamp
`t`, the newest label must equal `(floor((t + 30) / 86400) - 1) * 86400 * 1e6`,
and the other six labels must descend in exact one-day steps. Thus a label that
looks 24–48 hours old is not necessarily a stale daily sample.

Relevant source:
[share-value snapshots](https://github.com/stakewise/v3-subgraph/blob/af016c4c24155aa57611337daf70322909c335b8/src/entities/vault.ts),
[day-end handler](https://github.com/stakewise/v3-subgraph/blob/af016c4c24155aa57611337daf70322909c335b8/src/mappings/snapshots.ts),
[annualization and timestamp helpers](https://github.com/stakewise/v3-subgraph/blob/af016c4c24155aa57611337daf70322909c335b8/src/helpers/utils.ts).

## Failure and freshness behavior

Unknown implementation/deployment/type/version, indexing errors, incomplete
pagination or reconciliation, missing daily samples, invalid values, a negative
seven-day yield, nonpositive
net TVL and stale prices/source blocks fail the invocation. Source blocks and
both market prices must be at most one hour old and no more than five minutes in
the future. A final RPC hash check catches an observed reorganization.

This only prevents writing a new bad observation. DeFiLlama's surrounding pipeline
may retain an earlier pool row after an adapter error. Throwing an exception does
**not** guarantee immediate public removal or a permanently current displayed
rate. Deployment/implementation changes require review before updating the pins.

## Tests

From the repository's adapter directory, after installing its dependencies:

```
npm run test --adapter=stakingverse
node stakingverse/test.cjs
node stakingverse/test-independent.cjs
```

The focused suite executes the exact adapter with synthetic, source-conformant
fixtures. It covers ordinary and escrow exits, partial checkpoints/claims,
legacy excluded assets, zero-share debt, rounding, pagination and failure guards.
These are arithmetic and mocked adapter-integration tests, not an EVM fork execution or
proof of every historical chain state.
