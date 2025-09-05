const { gql } = require('graphql-request');

const formatCollectsQuery = (pool, strategy, block) => {
  const queryString = gql`
    query data {
      pool(id: "${pool}") {
        collects(
          where: {owner: "${strategy}", _change_block: {number_gte: ${block}}}
        ) {
          id
          amount0
          amount1
          amountUSD
          transaction {
            burns {
              amount
              amount0
              amount1
            }
          }
        }
      }
    }
`;
  return queryString;
}

module.exports = { formatCollectsQuery };