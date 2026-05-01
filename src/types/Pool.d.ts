export interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
  type?:
    | 'VARIABLE_RATE_LENDING'
    | 'FIXED_RATE_LENDING'
    | 'YIELD_FARMING'
    | 'CONCENTRATED_LIQUIDITY'
    | 'OTHER';
  duration?: number;
  apyBase?: number;
  apyReward?: number;
  pricePerShare?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  searchTokenOverride?: string;
  token?: string;
  poolMeta?: string;
  url?: string;
  // optional lending protocol specific fields:
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  ltv?: number; // btw [0, 1]
}
