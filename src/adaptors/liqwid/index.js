const apy = async () => {
  const adaPool = {
    pool: "",
    chain: "Cardano",
    project: "liqwid",
    symbol: "ADA",
    tvlUsd = 0,
    apyBase = 0,
    apyReward = 0,
    rewardTokens = ["LQ"],
    underlyingTokens = ["ADA"],
    poolMeta = "",
    url = "",
    // lending protocol fields
    apyBaseBorrow = 0,
    apyRewardBorrow = 0,
    totalSupplyUsd = 0,
    totalBorrowUsd = 0,
    ltv = 0
  };

  const shenPool = {
    pool: "",
    chain: "Cardano",
    project: "liqwid",
    symbol: "SHEN",
    tvlUsd = 0,
    apyBase = 0,
    apyReward = 0,
    rewardTokens = ["LQ"],
    underlyingTokens = ["SHEN"],
    poolMeta = "",
    url = "",
    // lending protocol fields
    apyBaseBorrow = 0,
    apyRewardBorrow = 0,
    totalSupplyUsd = 0,
    totalBorrowUsd = 0,
    ltv = 0
  };

  const djedPool = {
    pool: "",
    chain: "Cardano",
    project: "liqwid",
    symbol: "DJED",
    tvlUsd = 0,
    apyBase = 0,
    apyReward = 0,
    rewardTokens = ["LQ"],
    underlyingTokens = ["DJED"],
    poolMeta = "",
    url = "",
    // lending protocol fields
    apyBaseBorrow = 0,
    apyRewardBorrow = 0,
    totalSupplyUsd = 0,
    totalBorrowUsd = 0,
    ltv = 0
  };

  const iusdPool = {
    pool: "",
    chain: "Cardano",
    project: "liqwid",
    symbol: "iUSD",
    tvlUsd = 0,
    apyBase = 0,
    apyReward = 0,
    rewardTokens = ["LQ"],
    underlyingTokens = ["iUSD"],
    poolMeta = "",
    url = "",
    // lending protocol fields
    apyBaseBorrow = 0,
    apyRewardBorrow = 0,
    totalSupplyUsd = 0,
    totalBorrowUsd = 0,
    ltv = 0
  };

  const usdcPool = {
    pool: "",
    chain: "Cardano",
    project: "liqwid",
    symbol: "USDC",
    tvlUsd = 0,
    apyBase = 0,
    apyReward = 0,
    rewardTokens = ["LQ"],
    underlyingTokens = ["USDC"],
    poolMeta = "",
    url = "",
    // lending protocol fields
    apyBaseBorrow = 0,
    apyRewardBorrow = 0,
    totalSupplyUsd = 0,
    totalBorrowUsd = 0,
    ltv = 0
  };

  return [adaPool, shenPool, djedPool, iusdPool, usdcPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.liqwid.finance/',
};
