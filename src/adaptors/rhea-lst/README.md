# RHEA LST yield adapter

This adapter publishes two new staking series under the existing `rhea-lst`
protocol (ID 6985): RHEA staking through `xtoken.rhealab.near` and NEAR liquid
staking through `lst.rhealab.near`. Both entries link to
`https://app.rhea.finance/stake`.

These data paths are implemented for review. Their yield methodology has not
been approved. In particular, the remaining RHEA exit-fee/lower-bound
classification and the NEAR backend window/netting evidence limits described
below must stay visible during review.

## Shared snapshot and pricing

Each run reads one final NEAR block, then supplies that exact block height to
all contract views. The xRHEA product uses five views (`contract_metadata`,
`ft_total_supply`, `get_virtual_price`, `ft_metadata`, and
`get_exit_fee_bps`); rNEAR uses three (`get_summary`, `ft_total_supply`, and
`ft_metadata`). This prevents balances, supplies, and exchange rates from
being mixed across blocks.

USD prices come from DefiLlama's current-prices endpoint through the shared
RHEA data client. xRHEA does not need its own market quote: its TVL uses the
underlying `token.rhealab.near` RHEA quote. rNEAR TVL uses the
`wrap.near` quote. A missing quote removes only the affected product. A final
block or price-service failure may fail the run, and the run also fails when
neither product remains.

## RHEA staking

- TVL is `contract_metadata.cur_locked_token_amount / 10^18` multiplied by
  the underlying RHEA USD price. Undistributed reward inventory is excluded
  from active-position TVL. This can differ from protocol staking TVL that
  counts the contract's full token balance.
- `ft_total_supply` is an 18-decimal xRHEA share supply, while
  `get_virtual_price` is an 8-decimal amount of RHEA per xRHEA. The adapter
  checks their relationship against active backing using raw integer
  cross-products. Its bound is one `1e-8` underlying unit per share plus one
  raw underlying-unit rounding allowance; it does not use a percentage
  tolerance.
- The reported total `apy` is the current simple annualization
  `reward_per_sec * 31,536,000 / cur_locked_token_amount * 100` for an active
  position. It does not promise that the current reward inventory lasts a
  year. A zero current inventory is a real zero yield; missing or malformed
  inventory invalidates the product. Inventory divided by emission speed may
  be used as a point-in-time runway diagnostic, never as an official end date.
- `get_exit_fee_bps` is read dynamically and its cooldown tiers are included
  in `poolMeta`. Cooldown earns no yield. Exit fees are position dependent, so
  the adapter does not subtract one flat fee from APY and does not assume a
  user's free unstake quota applies to everyone.

The RHEA figure is current active-position reward annualization before exit
fees, not profit for a fixed deposit/withdrawal round trip. The exact reward
classification, ordinary-user lower-bound treatment, fee application, and
acceptability under the yield methodology still require external review. The
adapter does not add oRHEA, boosts, personal incentives, or the same share
growth again in base/reward fields.

## NEAR liquid staking

- TVL is `get_summary.total_staked_near_amount / 10^24` multiplied by the
  wrapped NEAR USD price.
- The adapter requires `ft_total_supply` to equal
  `get_summary.total_share_amount`. It treats `get_summary.ft_price` as the
  24-decimal amount of NEAR per rNEAR and checks the relationship with total
  staked NEAR using raw integer cross-products. The tolerance is one `1e-24`
  underlying unit per share plus one raw underlying-unit rounding allowance.
- APY comes from `https://api.rhea.finance/get-rnear-apy`. The response must
  have numeric `code: 0` and a finite non-negative percentage. That percentage
  is converted to a JavaScript number once; it is not multiplied by 100 and no
  additional 1% compensation is added.

The endpoint does not expose an as-of time, calculation window, update cadence,
fee treatment, compensation treatment, or base/reward split. The available
frontend and public response do not prove those definitions. Until backend
formula evidence is reviewed, this remains an unapproved total APY candidate;
it must not be described as verified net or base yield.

## Product and presentation limits

The two products settle independently after the shared block and price reads.
An xRHEA contract failure does not remove valid rNEAR data, and an rNEAR APY
failure does not remove valid xRHEA data. Request failures never become fixed
or zero APYs.

xRHEA holder-pipeline support and transferability remain unknown. The shared
`/stake` URL is the verified ordinary entry page, but a plain `stakeType` query
does not reliably select a tab because the application also interprets wallet
callback state. The adapter therefore does not forge transaction callback
parameters.

## Verification

Run the focused arithmetic, schema, identity, and product-isolation tests:

```sh
/Users/dss/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test src/adaptors/rhea-lst/*.spec.cjs
```

Run the repository's official live adapter validator separately:

```sh
npm run test --adapter=rhea-lst -- --runInBand
```
