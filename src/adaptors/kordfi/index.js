const { request, gql } = require('graphql-request');
const { getTzbtcLendPool, getXtzLendPool } = require('./helper');
const graphUrl = 'https://back-llb-beta.kord.fi/v1/graphql';

const DataQuery = gql`
  query DataQuery {
    contractInfo {
      tzbtcDeposit
      tzbtcDepositIndex
      tzbtcDepositRate
      tzbtcGrossCredit
      tzbtcGrossCreditIndex
      xtzDeposit
      xtzDepositIndex
      xtzDepositRate
      xtzGrossCredit
      xtzGrossCreditIndex
    }
    externalInfo {
      tzbtcRate
      xtzRate
    }
  }
`;

async function getPools() {
  const data = await request(graphUrl, DataQuery);
  return [getTzbtcLendPool(data), getXtzLendPool(data)];
}

module.exports = {
  timetravel: false,
  apy: getPools, // Main function, returns pools
};
