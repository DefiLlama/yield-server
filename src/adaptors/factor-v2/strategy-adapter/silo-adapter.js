const sdk = require('@defillama/sdk5');
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
    'https://api.thegraph.com/subgraphs/name/siros-ena/silo-finance-arbitrum-alt',
    subgraphQuery,
    {
      interestRateId: `LENDER-VARIABLE-${siloAddress.toLowerCase()}-${underlyingSiloAddress.toLowerCase()}`,
    }
  );

  const apr = parseFloat(response.interestRate.rate);

  return apr;
}

module.exports = { getSiloApr };
