export interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
  apyBase?: number;
  apyReward?: number;
  pricePerShare?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  searchTokenOverride?: string;
  isIntrinsicSource?: boolean;
  token?: string;
  poolMeta?: string;
  url?: string;
  // optional lending protocol specific fields:
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  borrowToken?: string; // underlying token address/string the borrower receives
  ltv?: number; // btw [0, 1]
}
