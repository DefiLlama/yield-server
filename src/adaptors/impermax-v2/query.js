const graphQuery = `{
  borrowables {
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
    lendingPool {
      id
      collateral { 
        liquidationFee
        liquidationIncentive
        safetyMargin
      }
      pair {
        uniswapV2Factory
        token0 {
          id
          name
          symbol
          decimals
        }
        token1 {
          id
          name
          symbol
          decimals
        }
      }
    }
  }
}`;

module.exports = {
  graphQuery,
};
