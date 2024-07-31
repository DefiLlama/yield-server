const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

async function getSiloAddress(underlyingTokenAddress) {
  const [{ output: underlyingSiloAddress }, { output: siloAddress }] =
    await Promise.all([
      sdk.api.abi.call({
        target: underlyingTokenAddress,
        abi: 'address:asset',
        chain: 'arbitrum',
      }),
      sdk.api.abi.call({
        target: underlyingTokenAddress,
        abi: 'address:silo',
        chain: 'arbitrum',
      }),
    ]);

  return { underlyingSiloAddress, siloAddress };
}

async function getSiloApr(underlyingTokenAddress) {
  const { siloAddress, underlyingSiloAddress } = await getSiloAddress(
    underlyingTokenAddress
  );

  const subgraphQuery = gql`
    query GetInterestRate($interestRateId: String!) {
      interestRate(id: $interestRateId) {
        rate
      }
    }
  `;

  const response = await request(
    sdk.graph.modifyEndpoint('HduBrJQ362TT8LmLscKuYLpQcMffZe3Z43juCuGkLstG'),
    subgraphQuery,
    {
      interestRateId: `LENDER-VARIABLE-${siloAddress.toLowerCase()}-${underlyingSiloAddress.toLowerCase()}`,
    }
  );

  const apr = parseFloat(response.interestRate.rate);

  return apr;
}

module.exports = { getSiloApr };
