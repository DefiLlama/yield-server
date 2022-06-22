const { gql } = require('graphql-request');

const queryDailyPoolStatus = gql`
{
  dailyPoolStatuses(orderBy: from, orderDirection: desc) {
    volumeUSD
    avgFeeInBps
    feeUSD
    txCount
  }
}
`;

module.exports = {
  queryDailyPoolStatus,
}