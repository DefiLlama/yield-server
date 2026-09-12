# RHEA Lend adapter

This adapter publishes six allowlisted stablecoin deposit markets from RHEA's
NEAR lending contract. It queries
[`contract.main.burrow.near`](https://nearblocks.io/address/contract.main.burrow.near)
through the public [FastNEAR RPC](https://free.rpc.fastnear.com) with
`get_assets({ token_ids })`. The explicit list keeps bridged assets separate and
does not discover or merge markets by symbol.

| Symbol | Underlying token ID                                                |
| ------ | ------------------------------------------------------------------ |
| USDC   | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |
| USDt   | `usdt.tether-token.near`                                           |
| USDC.e | `a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near`     |
| USDT.e | `dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near`     |
| DAI    | `6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near`     |
| FRAX   | `853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near`     |

USD prices and token metadata decimals come from the
[DefiLlama current-prices endpoint](https://coins.llama.fi/prices/current/near:wrap.near).
The adapter requires a positive finite price, decimals from 0 through 36,
confidence of at least 0.5, and a timestamp no more than one hour old and not
in the future. Missing or invalid quotes remove only their affected markets.
FRAX follows the same on-chain accounting and DefiLlama quote path; its price
is never assumed to be $1. Legacy API dollar totals are not used.

## Accounting

Contract balances use `price decimals + asset.config.extra_decimals`; they are
not assumed to have one shared raw precision. The current four USDC/USDT
markets use 6 price decimals plus 12 extra decimals, while DAI and FRAX use 18 plus 0.

- Total supply is `supplied.balance + reserved + prot_fee`.
- Total borrow is `borrowed.balance + margin_debt.balance + margin_pending_debt`.
- TVL is total supply minus total borrow, valued with the current USD quote.
- Base supply yield is the contract's annual `supply_apr` fraction multiplied
  by 100. It is not compounded again.
- Borrow yield is `borrow_apr * 100` when that optional field is present and
  valid. A missing field is omitted; malformed or negative data invalidates
  only that market.

Empty reward maps do not produce reward fields. If a nonempty reward program
appears, the adapter reports that its reward yield was omitted and continues
to publish the verified base yield. It does not fabricate a zero reward APY.

## Failure and history behavior

RPC and HTTP requests use a 15 second timeout, at most three total attempts,
and no more than four in-flight requests per client. GET response bodies are
parsed as JSON after transport retries complete. Network errors, HTTP 429, and
HTTP 5xx responses are retryable; contract, JSON, and schema errors are not.
Invalid assets are reported and skipped independently, and the run fails when
no market remains.

Pool IDs begin with `rhea-lend-` and are new series under protocol ID 1546.
They have independent history from earlier Burrow adapter IDs. This adapter
does not modify or re-enable the excluded legacy adapter, and this methodology
does not imply DefiLlama review or approval.

## Verification

Run the focused arithmetic, transport, and adapter tests, then the repository's
official live validator:

```sh
node --test src/adaptors/rhea-lend/*.spec.cjs
npm run test --adapter=rhea-lend -- --runInBand
```

The focused tests run separately because existing repository workflows are
unchanged.
