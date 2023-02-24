export type ChickenBondsStrategy = {
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
};

export type ChickenBondsStrategies = Array<ChickenBondsStrategy>;

export type PartialCurvePoolData = Partial<{
  data: {
    poolData: Array<{
      id: string;
      gaugeRewards: Array<{ apy: number }>;
      usdTotal: number;
    }>;
  };
}>;

export type PartialCurvePoolDetails = Partial<{
  data: {
    poolDetails: Array<{ poolAddress: string; apy: number }>;
  };
}>;

module.exports = {
  ChickenBondsStrategy,
  ChickenBondsStrategies,
  PartialCurvePoolData,
  PartialCurvePoolDetails,
};
