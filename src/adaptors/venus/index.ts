const utils = require('../utils');

const API_URL: string = 'https://api.venus.io/api/governance/venus';

const XVS = '0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63';

interface Market {
  address: string;
  underlyingSymbol: string;
  totalSupplyUsd: string;
  totalBorrowsUsd: string;
  supplyApy: string;
  supplyVenusApy: string;
  underlyingAddress: string;
  borrowApy: number;
  borrowVenusApy: string;
  collateralFactor: string;
}

const getApy = async () => {
  const markets = await utils.getData(API_URL);
  const marketsData: Array<Market> = markets.data.markets;

  const pools = marketsData.map((market) => ({
    pool: market.address,
    chain: utils.formatChain('binance'),
    project: 'venus',
    symbol: market.underlyingSymbol,
    tvlUsd: Number(market.totalSupplyUsd) - Number(market.totalBorrowsUsd),
    apyBase: Number(market.supplyApy),
    apyReward: Number(market.supplyVenusApy),
    rewardTokens: [XVS],
    underlyingTokens:
      market.underlyingSymbol === 'BNB'
        ? ['0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c']
        : [],
    // borrow fields
    apyBaseBorrow: Number(market.borrowApy) * -1,
    apyRewardBorrow: Number(market.borrowVenusApy),
    totalSupplyUsd: Number(market.totalSupplyUsd),
    totalBorrowUsd: Number(market.totalBorrowsUsd),
    ltv: Number(market.collateralFactor) / 1e18,
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.venus.io/#/',
};
