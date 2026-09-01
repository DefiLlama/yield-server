const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const { capitalizeFirstLetter } = require('../utils');

const urlGaugesEthereum = sdk.graph.modifyEndpoint('4sESujoqmztX6pbichs4wZ1XXyYrkooMuHA8sKkYxpTn');

// For reference - this is how chains are stored in the gauges subgraph
// const chainToEnum = {
//   arbitrum: 0,
//   xdai: 1,
//   polygon: 2,
//   optimism: 3,
//   avalanche: 4,
//   polygonZkEvm: 5,
//   base: 6,
// };

const queryChildGauge = gql`
  query ($chain: String!) {
    rootGauges(where: { chain: $chain }) {
      chain
      id
      recipient
      relativeWeightCap
    }
  }
`;

/**
 * @param chain chainString
 * @returns array of: {chain, id (root gauge address on ethereum), recipient (gauge on child chain), relativeWeightCap}
 */
const getChildChainRootGauge = async (chain) => {
  chain = capitalizeFirstLetter(chain);

  const variables = { chain };
  const { rootGauges } = await request(
    urlGaugesEthereum,
    queryChildGauge,
    variables
  );

  return rootGauges;
};

module.exports = {
  getChildChainRootGauge,
};
