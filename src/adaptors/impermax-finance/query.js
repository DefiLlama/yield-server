const graphQuery = `{
  lendingPools {
    id
    borrowable0 {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      underlying {
        id
        name
        symbol
        decimals
      }
    }
    borrowable1 {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      underlying {
        id
        name
        symbol
        decimals
      }
    }
    collateral {
      id
      safetyMargin
      liquidationIncentive
      liquidationFee
      totalBalance
    }
    pair {
      uniswapV2Factory
    }
  }
}`;

module.exports = {
  graphQuery,
};
