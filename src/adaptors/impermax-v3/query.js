const graphQuery = `{
  borrowables(limit: 1000) {
    items {
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
        nftlp {
          factory
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

const vaultGraphQueryV2 = `{ 
    lendingVaults {
      items {
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
    }
}`

module.exports = {
  graphQuery,
  vaultGraphQuery,
  vaultGraphQueryV2,
};
