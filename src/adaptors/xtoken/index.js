// An adaptor is just a javascript (or typescript) file that exports 
// an async function that returns an array of objects that represent
// pools of a protocol. The pools follow the following 
// schema (all values are just examples):

// interface Pool {
//   pool: string;
//   chain: string;
//   project: string;
//   symbol: string;
//   tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
//   apyBase?: number;
//   apyReward?: number;
//   rewardTokens?: Array<string>;
//   underlyingTokens?: Array<string>;
//   poolMeta?: string;
//   url?: string;
//   // optional lending protocol specific fields:
//   apyBaseBorrow?: number;
//   apyRewardBorrow?: number;
//   totalSupplyUsd?: number;
//   totalBorrowUsd?: number;
//   ltv?: number; // btw [0, 1]
// }