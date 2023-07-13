const { request, gql } = require('graphql-request');

const SUBGRAPH_URL ='https://api.thegraph.com/subgraphs/name/stakehouse-dev/stakehouse-protocol';

const totaldETHMinted = gql`
  query totaldETHMinted {
  stakeHouses {
    dETHMintedWithinHouse
  }
}
`;

const getTotaldETHMinted = async () => {
  const { totalDETHMintedAmt } = await request(SUBGRAPH_URL, totaldETHMinted, {});
  return totalEthMinted;
};

module.exports = {
  getTotaldETHMinted
};
