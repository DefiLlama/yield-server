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

const vaultGraphQuery = `{ 
    lendingVaults {
    id
    supplyRate
    underlying {
      id
      symbol
    }
    reserveFactor
    lastUpdate
    totalBalance
    totalSupply
    exchangeRate
    availableLiquidity
  }
}`

module.exports = {
  graphQuery,
  vaultGraphQuery
};
