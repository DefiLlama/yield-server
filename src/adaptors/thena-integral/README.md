# THENA Integral

Adds the direct Algebra Integral (V3,3) pools on BNB Chain under the existing
`thena-integral` protocol slug (`6179`). Legacy `thena-v1` and `thena-fusion`
adapters are unchanged.

## Sources and methodology

- Pool discovery and cumulative fees/volume: THENA Integral subgraph
  `BoHp9H2rGzVFPiqc56PJ1Gw7EPDaiHMcupsUuksMGp2K`.
- Farming discovery: THENA Integral farming subgraph
  `eTT8C92PwJiquV8S7oCkAzXToG3XJkkZnm4pBFtrSmc`.
- Both registries are paginated at a common block. Reject indexing errors and
  observations older than 30 minutes. Use the standard SDK Graph gateway;
  no API key is embedded in the adapter.
- TVL: token balances held by each pool at that block, valued using DefiLlama
  prices. Missing/low-confidence/stale prices or failed balance reads exclude
  the affected pool. The token blacklist matches the Integral TVL adapter.
- **Earn Fees:** change in cumulative `feesUSD` over the previous 24 hours,
  annualized against pool TVL. Deduct community fees (denominated in thousandths)
  using the largest directional share observed at either end of the window.
  This is a conservative estimate for asymmetric shares; fee-share changes
  occurring entirely between the two observations are not reconstructed.
  The subgraph's actual cumulative fees capture dynamic swap fees, so this does
  not multiply yesterday's volume by today's fee tier.
- **Earn THE:** latest farming nonce for each pool, with live virtual-pool reward
  rates/reserves, deactivation state, and the plugin's current incentive checked
  on-chain at the same block. Subtract accrued but not yet checkpointed rewards
  from reserves before treating a rate as funded. Include funded reward and
  bonus tokens only when DefiLlama provides a price. Annualize the current funded
  rate, without assuming a year of committed funding.
- APRs use total pool TVL, not active-range or staked-only TVL, with no leverage,
  boost or assumed compounding. Actual concentrated-position yield depends on
  its range and participation; these are pool-wide indicators, not guaranteed
  individual returns. The repository's `apyBase`/`apyReward` fields carry these
  non-compounded annualized rates, consistent with its DEX adapters.
- Farming pools do not add swap fees paid to voters to LP rewards. Fees and
  farming pools are distinct contract addresses and have distinct stable IDs.
- No separate Gamma/ICHI vault rows, voting incentives, or veTHE rebase yield.
  Vault liquidity already held in underlying pools contributes to pool TVL.
- Direct positions are NFTs; `token: null` avoids claiming that the pool address
  is an ERC-20 receipt token. Pool links lead to THENA's liquidity directory.

## Validation

From the repository root:

```sh
node --test src/adaptors/thena-integral/math.test.cjs
```

Run the standard repository test from `src/adaptors` with dependencies installed
and a funded `GRAPH_API_KEY` available to the SDK:

```sh
npm run test --adapter=thena-integral
```

A missing data source is a failure/unknown observation, not a fabricated yield.
DefiLlama applies its own listing and TVL filters after ingestion.
