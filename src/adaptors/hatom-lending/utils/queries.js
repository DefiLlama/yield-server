const queryPrices = `
  query QueryTokenPrices {
    queryLiquidStaking {
      state {
        cashReserve
        totalShares
      }
    }
    queryToken {
      id
      symbol
      dailyPriceHistory(first: 1, order: { desc: day }) {
        quote {
          priceInEgld
          timestamp
        }
        price {
          price
          timestamp
        }
      }
    }
  }
`;

const queryMoneyMarkets = `
query QueryMoneyMarket {
      queryMoneyMarket {
        address
        totalCollateral
        underlying {
					symbol
          name
          decimals
          id
        }
				stateHistory(first:1, order:{
					desc: timestamp
				}) {
					cash
					borrows
					reserves
					timestamp
					supplyAPY
					supplyRatePerSecond
					borrowAPY
					borrowRatePerSecond
					totalSupply
				}
      }
    }`

const queryRewards = `
query QueryRewards {
	queryRewardsBatchState {
		id
		speed
		type
		endTime
		fullyDistributed
		totalAmount
		moneyMarket{
			address
			underlying{
				symbol
			}
    }
		rewardsToken{
			symbol
			decimals
		}
	}
}`
module.exports = {
  queryPrices,
  queryMoneyMarkets,
  queryRewards
};