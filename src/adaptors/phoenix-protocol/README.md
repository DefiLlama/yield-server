# phoenix-protocol

Surfaces the Phoenix Protocol phUSD staking pool (Ethereum mainnet) on DefiLlama yields.

Stakers deposit phUSD into the staking contract and earn two emission-based rewards:

- **USDC** — distributed via linear depletion. APY = `rewardBalance / depletionDuration` annualized, divided by USD TVL.
- **phUSD** — auto-minted to hit the contract's `desiredAPYBps` target. APY = `desiredAPYBps / 100` directly.

phUSD is priced from the Balancer V3 phUSD/sUSDS pool (50/50 weighted): the spot ratio gives phUSD-in-sUSDS, and the sUSDS ERC4626 `convertToAssets` rate converts to USDS (treated as $1). USDC is hardcoded to $1. If pricing fails, the adapter falls back to a $1 peg with a warning.
