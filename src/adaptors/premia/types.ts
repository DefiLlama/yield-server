export interface PoolType {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  ltv?: number;
}

export interface FetchedPool {
  id: string;
  name: string;
  address: string;
  netSizeInUsd: string;
  openInterestInUsd: string;
  underlying: {
    address: string;
    symbol: string;
  };
  profitLossPercentage: string;
  totalLocked: string;
}
