const getPoolsQuery = `
  query {
    pools(first: 1000, orderBy: createdAt, orderDirection: desc) {
        id
        token0 {
          id
          symbol
          name
          decimals
        }
        token1 {
          id
          symbol
          name
          decimals
        }
        rewardTokens {
          id
          symbol
          name
          decimals
        }
        price
        rewardAmounts
        rewardDuration
        periodFinish
        bufferTokenBalance
        stakedTokenBalance
      }
  }
`;

module.exports = {
  getPoolsQuery,
};
